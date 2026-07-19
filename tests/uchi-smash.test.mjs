import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const INDEX_PATH = new URL("../index.html", import.meta.url);
const HTML = fs.readFileSync(INDEX_PATH, "utf8");

function loadGame() {
  const scripts = [...HTML.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const gameScript = scripts.find(source => source.includes('"use strict"'));
  assert.ok(gameScript, "inline game script should exist");

  const noop = () => {};
  const context2d = new Proxy({}, {
    get(target, property) {
      if (!(property in target)) target[property] = noop;
      return target[property];
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  });
  const elements = new Map();
  const makeElement = id => {
    const element = {
      id,
      hidden: ["online", "ol-room", "ol-stage", "btn-start"].includes(id),
      disabled: false,
      value: "",
      textContent: "",
      style: {},
      addEventListener: noop,
      appendChild: noop,
      removeChild: noop,
      focus: noop,
      select: noop,
    };
    if (id === "game") {
      element.width = 1280;
      element.height = 720;
      element.getContext = () => context2d;
    }
    return element;
  };
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, makeElement(id));
    return elements.get(id);
  };
  const sandbox = {
    console,
    Math,
    Map,
    Set,
    URLSearchParams,
    location: { search: "", origin: "http://localhost", pathname: "/index.html" },
    navigator: { getGamepads: () => [], clipboard: null },
    performance: { now: () => 0 },
    requestAnimationFrame: () => 1,
    setTimeout,
    clearTimeout,
    document: {
      getElementById: getElement,
      createElement: () => makeElement("created"),
      body: { appendChild: noop, removeChild: noop },
      execCommand: () => true,
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.addEventListener = noop;
  vm.createContext(sandbox);
  vm.runInContext(gameScript, sandbox, { filename: INDEX_PATH.pathname });
  assert.ok(sandbox.UCHI, "window.UCHI should be exposed");
  return sandbox;
}

function makeConn() {
  return {
    open: true,
    sent: [],
    send(message) { this.sent.push(structuredClone(message)); },
    close() { this.open = false; },
  };
}

function sampleFor(tick, slot) {
  const phase = (tick + slot * 17) % 180;
  const up = (tick + slot * 5) % 97 === 0;
  const down = (tick + slot * 11) % 113 === 0;
  return {
    left: phase < 38,
    right: phase >= 90 && phase < 128,
    up,
    down,
    jump: up,
    attack: (tick + slot * 7) % 61 < 4,
    guard: (tick + slot * 13) % 149 < 5,
    balloon: (tick + slot * 19) % 211 < 8,
    start: false,
  };
}

function allFinite(value, seen = new Set()) {
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object" || seen.has(value)) return true;
  seen.add(value);
  return Object.values(value).every(child => allFinite(child, seen));
}

test("release constants and input codec stay coherent", () => {
  const sandbox = loadGame();
  const { UCHI: game } = sandbox;
  assert.match(HTML, /<title>PYGMIX BONBON<\/title>/);
  assert.match(HTML, /ctx\.fillText\("PYGMIX BONBON", W \/ 2, 120\)/);
  assert.match(HTML, /const GAME_VERSION = "0\.9\.5"/);
  assert.match(HTML, /リーチ・速度・ビーム・巨大化・風船補充の5種類/);
  assert.equal(game.PHYS.gravity, 0.495);
  assert.equal(game.STAGES.length, 6);
  assert.equal(new Set(game.STAGES.map(stage => stage.name)).size, 6);
  assert.equal(game.STAGES.some(stage => stage.name === "エレベーター"), false);
  assert.equal(game.STAGES.some(stage => stage.name === "ワープ広場"), false);
  assert.equal(game.STAGES.some(stage => stage.name === "うごく壁"), false);
  assert.equal(game.STAGES.some(stage => stage.name === "ながれ場"), false);
  const flowTower = game.STAGES.find(stage => stage.name === "ながれの塔");
  assert.ok(flowTower);
  assert.equal(flowTower.platforms.filter(platform => platform.conveyor).length, 2);
  assert.equal(flowTower.walls.length, 2);
  assert.equal(flowTower.wallSpeed, 0.00396);
  assert.equal(flowTower.walls.every(wall => wall.height === 90), true);
  const flowGround = flowTower.platforms.filter(platform => platform.main);
  assert.equal(flowTower.walls[0].x, Math.min(...flowGround.map(platform => platform.x)));
  assert.equal(flowTower.walls[1].x + flowTower.walls[1].w, Math.max(...flowGround.map(platform => platform.x + platform.w)));
  assert.ok(Math.max(...flowTower.platforms.map(platform => platform.y)) - Math.min(...flowTower.platforms.map(platform => platform.y)) >= 300);
  assert.equal(typeof sandbox.makeKeyboardSource(0).sample, "function");
  assert.equal(typeof sandbox.makeGamepadSource(0).sample, "function");
  assert.equal(game.makeMatchState([0, 1], 0).timeLeft, 10800);
  for (let byte = 0; byte < 256; byte++) {
    assert.equal(game.encodeSample(game.decodeSample(byte)), byte);
  }
});

test("only the double jump starts one somersault", () => {
  const sandbox = loadGame();
  const { UCHI: game } = sandbox;
  const match = game.makeMatchState([0, 1], 0);
  const player = match.players[0];
  const neutral = {
    left: false, right: false, up: false, down: false,
    jump: false, attack: false, guard: false, balloon: false, start: false,
  };
  const jump = { ...neutral, jump: true };
  match.countdown = 0;
  player.x = 640;
  player.y = 580;
  player.onGround = true;
  player.invuln = 9999;

  const firstJumpEvents = game.stepMatch(match, [jump, neutral]);
  assert.equal(firstJumpEvents.some(event => event.type === "double-jump"), false);
  assert.equal(game.fx.flips[player.slot], null);

  game.stepMatch(match, [neutral, neutral]);
  const secondJumpEvents = game.stepMatch(match, [jump, neutral]);
  const flips = secondJumpEvents.filter(event => event.type === "double-jump");
  assert.equal(flips.length, 1);
  assert.equal(flips[0].slot, player.slot);
  assert.equal(player.airJumps, 0);

  sandbox.handleEvents(secondJumpEvents);
  assert.equal(game.fx.flips[player.slot].remaining, game.DOUBLE_JUMP_FLIP_TICKS);
  for (let i = 0; i < game.DOUBLE_JUMP_FLIP_TICKS; i++) sandbox.updateFx();
  assert.equal(game.fx.flips[player.slot], null);
});

test("lobby controls open in a modal and pause lobby input", () => {
  const sandbox = loadGame();
  const { UCHI: game } = sandbox;
  const helpOpen = sandbox.document.getElementById("help-open");
  const helpModal = sandbox.document.getElementById("help-modal");
  assert.match(HTML, /role="dialog" aria-modal="true"/);
  assert.match(HTML, /参加：F（左キーボード）／ L（右キーボード）／ ゲームパッド X/);
  assert.match(HTML, /rect\.height \* \(682 \/ H\)/);

  sandbox.setLobbyHelpOpen(true);
  assert.equal(helpModal.hidden, false);
  assert.equal(helpOpen.hidden, true);

  game.keys.add("KeyC");
  sandbox.updateLobby();
  assert.equal(game.APP.slots.filter(Boolean).length, 0);

  sandbox.setLobbyHelpOpen(false);
  assert.equal(helpModal.hidden, true);
});

test("circus warps choose two of four candidates and change every cycle", () => {
  const sandbox = loadGame();
  const { UCHI: game } = sandbox;
  const stageIndex = game.STAGES.findIndex(stage => stage.name === "サーカステント");
  assert.notEqual(stageIndex, -1);
  const match = game.makeMatchState([0, 1, 2, 3], stageIndex);
  assert.equal(match.warpCandidates.length, 4);
  assert.equal(match.warps.length, 2);
  assert.equal(new Set(match.warpSelection).size, 2);

  for (let cycle = 0; cycle < 12; cycle++) {
    const previous = [...match.warpSelection];
    match.warpTimer = 1;
    const vanishEvents = [];
    sandbox.updateWarps(match, vanishEvents);
    assert.equal(match.warpOn, false);
    assert.notDeepEqual([...match.warpSelection], previous);
    assert.equal(new Set(match.warpSelection).size, 2);
    assert.ok(match.warpSelection.every(index => index >= 0 && index < 4));
    assert.deepEqual([...match.warps].map(warp => warp.link), [1, 0]);
    assert.equal(vanishEvents[0].type, "warp-vanish");

    const upcoming = [...match.warpSelection];
    match.warpTimer = 1;
    const appearEvents = [];
    sandbox.updateWarps(match, appearEvents);
    assert.equal(match.warpOn, true);
    assert.deepEqual([...match.warpSelection], upcoming);
    assert.equal(appearEvents[0].type, "warp-appear");
  }
});

test("all stages remain deterministic and finite for four players", () => {
  const { UCHI: game } = loadGame();
  for (let stageIndex = 0; stageIndex < game.STAGES.length; stageIndex++) {
    const left = game.makeMatchState([0, 1, 2, 3], stageIndex);
    const right = game.makeMatchState([0, 1, 2, 3], stageIndex);
    for (let tick = 0; tick < 1800; tick++) {
      game.stepMatch(left, [0, 1, 2, 3].map(slot => sampleFor(tick, slot)));
      game.stepMatch(right, [0, 1, 2, 3].map(slot => sampleFor(tick, slot)));
    }
    assert.deepEqual(left, right, game.STAGES[stageIndex].name);
    assert.ok(allFinite(left), `${game.STAGES[stageIndex].name} should not contain NaN/Infinity`);
  }
});

test("four-CPU matches complete deterministically on every stage", () => {
  const { UCHI: game } = loadGame();
  for (let stageIndex = 0; stageIndex < game.STAGES.length; stageIndex++) {
    const left = game.makeMatchState([0, 1, 2, 3], stageIndex);
    const right = game.makeMatchState([0, 1, 2, 3], stageIndex);
    const leftSources = [0, 1, 2, 3].map(() => game.makeCpuSource());
    const rightSources = [0, 1, 2, 3].map(() => game.makeCpuSource());
    for (let tick = 0; tick < 12000 && (!left.finished || !right.finished); tick++) {
      game.stepMatch(left, [0, 1, 2, 3].map(slot => game.cpuThink(leftSources[slot], slot, left)));
      game.stepMatch(right, [0, 1, 2, 3].map(slot => game.cpuThink(rightSources[slot], slot, right)));
    }
    assert.equal(left.finished, true, `${game.STAGES[stageIndex].name} should finish`);
    assert.deepEqual(left, right, game.STAGES[stageIndex].name);
    assert.ok(allFinite(left), `${game.STAGES[stageIndex].name} should not contain NaN/Infinity`);
  }
});

test("lobby disconnect compacts guest indices without losing connected status", () => {
  const sandbox = loadGame();
  const { NET, APP } = sandbox.UCHI;
  const entries = [1, 2, 3].map(idx => ({ conn: makeConn(), idx, verified: true }));
  NET.peer = {};
  NET.status = "connected";
  NET.conns = entries.slice();
  APP.phase = "lobby";

  sandbox.netHostConnClosed(entries[0]);

  assert.deepEqual(NET.conns.map(entry => entry.idx), [1, 2]);
  assert.equal(NET.status, "connected");
  assert.equal(entries[1].conn.sent.at(-1).y, "welcome");
  assert.equal(entries[1].conn.sent.at(-1).idx, 1);
  assert.equal(entries[2].conn.sent.at(-1).idx, 2);
});

test("rematch compacts indices after a middle guest leaves", () => {
  const sandbox = loadGame();
  const { NET, APP } = sandbox.UCHI;
  const entries = [1, 2, 3].map(idx => ({ conn: makeConn(), idx, verified: true }));
  NET.isHost = true;
  NET.peer = {};
  NET.status = "connected";
  NET.conns = entries.slice();
  APP.phase = "result";
  APP.stageIndex = 0;

  sandbox.netHostConnClosed(entries[0]);
  assert.deepEqual(NET.conns.map(entry => entry.idx), [2, 3], "result screen keeps current-match identities");

  sandbox.netHostStart();

  assert.deepEqual(NET.conns.map(entry => entry.idx), [1, 2]);
  assert.equal(NET.numPlayers, 3);
  assert.deepEqual([...APP.match.players].map(player => player.slot), [0, 1, 2]);
  for (const entry of NET.conns) {
    assert.equal(entry.conn.sent.at(-2).y, "welcome");
    assert.equal(entry.conn.sent.at(-2).idx, entry.idx);
    assert.equal(entry.conn.sent.at(-1).y, "start");
    assert.equal(entry.conn.sent.at(-1).n, 3);
  }
});

test("unverified guests cannot start a match or write another slot", () => {
  const sandbox = loadGame();
  const { NET, APP } = sandbox.UCHI;
  const verified = { conn: makeConn(), idx: 1, verified: true };
  const pending = { conn: makeConn(), idx: 2, verified: false };
  NET.isHost = true;
  NET.status = "connected";
  NET.conns = [verified, pending];
  APP.phase = "lobby";

  sandbox.netHostStart();
  assert.equal(APP.match, null);
  assert.match(NET.msg, /バージョン確認/);

  NET.gen = 7;
  NET.buffers = [[], [], []];
  sandbox.netHostOnData({ y: "i", g: 7, t: 5, p: 2, b: 255 }, verified);
  assert.equal(NET.buffers[2][5], undefined);
  sandbox.netHostOnData({ y: "i", g: 7, t: 5, p: 1, b: 255 }, verified);
  assert.equal(NET.buffers[1][5].balloon, true);
});
