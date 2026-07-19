import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const INDEX_PATH = new URL("../index.html", import.meta.url);
const HTML = fs.readFileSync(INDEX_PATH, "utf8");

function loadGame(search = "", savedStorage = null) {
  const scripts = [...HTML.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const gameScript = scripts.find(source => source.includes('"use strict"'));
  assert.ok(gameScript, "inline game script should exist");

  const noop = () => {};
  const makeGradient = () => ({ addColorStop: noop });
  const context2d = new Proxy({
    createLinearGradient: makeGradient,
    createRadialGradient: makeGradient,
  }, {
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
  const storage = savedStorage || new Map();
  const makeElement = id => {
    const element = {
      id,
      hidden: ["online", "ol-room", "ol-stage", "btn-start"].includes(id),
      disabled: false,
      value: "",
      textContent: "",
      style: {},
      classList: { add: noop, remove: noop, toggle: noop },
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
    location: { search, origin: "http://localhost", pathname: "/index.html" },
    navigator: { getGamepads: () => [], clipboard: null },
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
      clear: () => storage.clear(),
    },
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
    taunt: (tick + slot * 23) % 503 === 0,
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
  assert.match(HTML, /const GAME_VERSION = "0\.9\.27"/);
  assert.match(HTML, /リーチ・速度・ビーム・巨大化・風船補充の5種類/);
  assert.equal(game.PHYS.gravity, 0.495);
  assert.equal(game.DOWN_ATTACK.damageMult, 1.2);
  assert.equal(game.DOWN_ATTACK.groundedUpKbMult, 1.3);
  assert.equal(game.DOWN_ATTACK.startupTicks, 1);
  assert.equal(game.BODY_COLLISION.passes, 32);
  assert.equal(game.TAUNT_TICKS, 90);
  assert.equal(game.MID_CHARGE, 60);
  assert.equal(game.SPECIAL_CHARGE, 120);
  assert.equal(game.ATTACK.damage, 8);
  assert.equal(game.CHARGED_ATTACK.damage, 16);
  assert.equal(game.SPECIAL.damage, 27);
  assert.equal(game.SPECIAL.total - game.SPECIAL.activeFrom, 8);
  assert.equal(game.SPECIAL.activeFrom - game.SPECIAL.activeTo + 1, 43);
  assert.equal(game.SPECIAL.activeTo, 12);
  assert.equal(game.ITEM.chargedBeamRangeMult, 2);
  assert.equal(game.ITEM.chargedBeamThick, 64);
  assert.equal(game.STAGES.length, 7);
  assert.equal(new Set(game.STAGES.map(stage => stage.name)).size, 7);
  assert.equal(game.STAGES.some(stage => stage.name === "エレベーター"), false);
  assert.equal(game.STAGES.some(stage => stage.name === "ワープ広場"), false);
  assert.equal(game.STAGES.some(stage => stage.name === "うごく壁"), false);
  assert.equal(game.STAGES.some(stage => stage.name === "ながれ場"), false);
  assert.equal(game.LOBBY_CORNER_CHARACTERS.length, 4);
  assert.deepEqual([...game.LOBBY_CORNER_CHARACTERS].map(character => character.slot), [0, 1, 2, 3]);
  assert.equal(game.LOBBY_CORNER_CHARACTERS.filter(character => character.x < 640).length, 2);
  assert.equal(game.LOBBY_CORNER_CHARACTERS.filter(character => character.x > 640).length, 2);
  assert.equal(game.LOBBY_CORNER_CHARACTERS.filter(character => character.y < 360).length, 2);
  assert.equal(game.LOBBY_CORNER_CHARACTERS.filter(character => character.y > 360).length, 2);
  assert.doesNotMatch(HTML, /const arms = pose/);
  assert.doesNotMatch(HTML, /ctx\.arc\(0, 2, 10, 0\.15/);
  assert.doesNotMatch(HTML, /ctx\.fillText\(NAMES\[slot\], 0, 18\)/);
  const flowTower = game.STAGES.find(stage => stage.name === "ながれの塔");
  assert.ok(flowTower);
  assert.equal(flowTower.platforms.filter(platform => platform.conveyor).length, 2);
  assert.equal(flowTower.walls.length, 2);
  assert.equal(flowTower.wallSpeed, 0.00396);
  assert.equal(flowTower.walls.every(wall => wall.height === 90), true);
  const flowGround = flowTower.platforms.filter(platform => platform.main);
  const flowSteps = flowTower.platforms.filter(platform => !platform.main).sort((a, b) => b.y - a.y);
  assert.equal(flowGround.reduce((sum, platform) => sum + platform.w, 0), 600);
  assert.equal(flowGround.every(platform => platform.move?.axis === "x"), true);
  assert.equal(flowSteps.length, 3);
  assert.ok(flowSteps[0].x + flowSteps[0].w / 2 < 640);
  assert.ok(flowSteps[1].x + flowSteps[1].w / 2 > 640);
  assert.equal(flowSteps[2].x + flowSteps[2].w / 2, 640);
  assert.equal(flowTower.walls[0].x, Math.min(...flowGround.map(platform => platform.x)));
  assert.equal(flowTower.walls[1].x + flowTower.walls[1].w, Math.max(...flowGround.map(platform => platform.x + platform.w)));
  assert.ok(Math.max(...flowTower.platforms.map(platform => platform.y)) - Math.min(...flowTower.platforms.map(platform => platform.y)) >= 300);
  const skyIslands = game.STAGES.find(stage => stage.name === "うちゅう");
  assert.equal(skyIslands.gravityScale, 0.5);
  assert.equal(skyIslands.moveScale, 0.8);
  assert.equal(skyIslands.itemArc, true);
  assert.equal(skyIslands.theme.space, true);
  assert.equal("moon" in skyIslands.theme, false);
  assert.equal(skyIslands.ceiling.w, 1280 * 0.7);
  assert.equal(skyIslands.ceiling.x, (1280 - skyIslands.ceiling.w) / 2);
  assert.equal(skyIslands.ceiling.segments, 14);
  assert.equal(skyIslands.ceiling.breakSpeed, 10.5);
  assert.equal(skyIslands.platforms.length, 13);
  const ice = game.STAGES.find(stage => stage.name === "こおり");
  assert.ok(ice);
  assert.equal(ice.theme.ice, true);
  assert.equal(ice.penguin, true);
  assert.equal(game.PENGUIN.firstWait, 240);
  assert.equal(game.PENGUIN.waitTicks, 330);
  assert.equal(game.PENGUIN.appearTicks, 45);
  assert.equal(game.PENGUIN.warnTicks, 60);
  assert.equal(game.PENGUIN.chargeHeight, 30);
  assert.equal(game.PENGUIN.fallGravity, 0.55);
  assert.equal(game.PENGUIN.maxFall, 12);
  assert.equal(game.PENGUIN.stompBounce, -8.5);
  assert.deepEqual([...game.DEFAULT_GAMEPAD_MAPPING.stagePrev], [14]);
  assert.deepEqual([...game.DEFAULT_GAMEPAD_MAPPING.stageNext], [15]);
  assert.deepEqual([...game.DEFAULT_GAMEPAD_MAPPING.start], [9]);
  assert.equal(ice.platforms.every(platform => platform.slope !== 0), true);
  assert.equal(ice.platforms.filter(platform => platform.main).length, 2);
  assert.ok(ice.icePhysics.accel < game.PHYS.groundAccel);
  assert.ok(ice.icePhysics.friction > game.PHYS.friction);
  assert.equal(typeof sandbox.makeKeyboardSource(0).sample, "function");
  assert.equal(typeof sandbox.makeGamepadSource(0).sample, "function");
  assert.equal(typeof game.itemTimeFraction, "function");
  assert.equal(game.makeMatchState([0, 1], 0).timeLeft, 10800);
  for (let mask = 0; mask < 512; mask++) {
    assert.equal(game.encodeSample(game.decodeSample(mask)), mask);
  }
});

test("keyboard Y and gamepad B-circle trigger only the taunt input", () => {
  const sandbox = loadGame();
  const { UCHI: game } = sandbox;

  game.keys.add("KeyY");
  const keyboard = sandbox.makeKeyboardSource(0).sample();
  assert.equal(keyboard.taunt, true);
  assert.equal(sandbox.sampleLocalMerged().taunt, true);
  game.keys.clear();

  const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
  sandbox.navigator.getGamepads = () => [{ axes: [0, 0], buttons }];
  buttons[1].pressed = true;
  const circle = sandbox.makeGamepadSource(0).sample();
  assert.equal(circle.taunt, true);
  assert.equal(circle.jump, false);

  buttons[1].pressed = false;
  buttons[0].pressed = true;
  const cross = sandbox.makeGamepadSource(0).sample();
  assert.equal(cross.jump, true);
  assert.equal(cross.taunt, false);
});

test("gamepad actions can be remapped per pad and persist in local storage", () => {
  const storage = new Map();
  const sandbox = loadGame("", storage);
  const { UCHI: game } = sandbox;
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
  const gamepad = { id: "Test Pad", axes: [0, 0], buttons };
  sandbox.navigator.getGamepads = () => [gamepad];

  const remapped = game.remapGamepadButton(game.getGamepadMapping(0), "attack", 5);
  game.setGamepadMapping(0, remapped);
  assert.deepEqual([...game.getGamepadMapping(0).attack], [5]);
  assert.deepEqual([...game.getGamepadMapping(0).guard], [4, 6, 7]);

  buttons[5].pressed = true;
  let sample = sandbox.makeGamepadSource(0).sample();
  assert.equal(sample.attack, true);
  assert.equal(sample.guard, false);
  assert.equal(sandbox.sampleLocalMerged().attack, true);

  buttons[5].pressed = false;
  buttons[4].pressed = true;
  sample = sandbox.makeGamepadSource(0).sample();
  assert.equal(sample.attack, false);
  assert.equal(sample.guard, true);
  assert.ok(storage.has(game.GAMEPAD_MAPPING_STORAGE_KEY));

  const sharedAcrossContexts = game.remapGamepadButton(game.getGamepadMapping(0), "start", 5);
  assert.deepEqual([...sharedAcrossContexts.attack], [5]);
  assert.deepEqual([...sharedAcrossContexts.start], [5]);

  const reloaded = loadGame("", storage);
  reloaded.navigator.getGamepads = () => [gamepad];
  assert.deepEqual([...reloaded.UCHI.getGamepadMapping(0).attack], [5]);
  assert.deepEqual([...reloaded.UCHI.getGamepadMapping(0).guard], [4, 6, 7]);
});

test("custom gamepad menu buttons select a stage and act as Enter", () => {
  const sandbox = loadGame();
  const { UCHI: game } = sandbox;
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
  const gamepad = { id: "Menu Pad", axes: [0, 0], buttons };
  sandbox.navigator.getGamepads = () => [gamepad];

  let mapping = game.remapGamepadButton(game.getGamepadMapping(0), "stageNext", 6);
  mapping = game.remapGamepadButton(mapping, "start", 0);
  game.setGamepadMapping(0, mapping);
  assert.deepEqual([...game.getGamepadMapping(0).jump], [0]);
  assert.deepEqual([...game.getGamepadMapping(0).stageNext], [6]);
  assert.deepEqual([...game.getGamepadMapping(0).start], [0]);

  const initialStage = game.APP.stageIndex;
  buttons[6].pressed = true;
  sandbox.updateLobby();
  assert.equal(game.APP.stageIndex, (initialStage + 1) % game.STAGES.length);

  buttons[6].pressed = false;
  sandbox.updateLobby();
  game.APP.slots[0] = { source: sandbox.makeKeyboardSource(0) };
  game.APP.slots[1] = { source: sandbox.makeCpuSource(), cpu: true };
  buttons[0].pressed = true;
  sandbox.updateLobby();
  assert.equal(game.APP.phase, "match");
});

test("down on main ground halves body height and ducks under a forward laser", () => {
  const neutral = {
    left: false, right: false, up: false, down: false,
    jump: false, attack: false, guard: false, balloon: false, taunt: false, start: false,
  };

  function runLaser(victimInput) {
    const sandbox = loadGame();
    const { UCHI: game } = sandbox;
    const match = game.makeMatchState([0, 1], 0);
    const [attacker, victim] = match.players;
    match.countdown = 0;
    match.itemTimer = 9999;
    attacker.x = 420;
    attacker.y = 560;
    attacker.vx = attacker.vy = 0;
    attacker.onGround = true;
    attacker.facing = 1;
    attacker.itemType = "beam";
    attacker.itemTimer = 9999;
    attacker.attackTimer = game.ATTACK.activeFrom + 1;
    attacker.attackIsSpecial = false;
    attacker.attackDir = "fwd";
    attacker.attackVictims = [];
    victim.x = 650;
    victim.y = 560;
    victim.vx = victim.vy = 0;
    victim.onGround = true;
    victim.invuln = 0;

    const events = game.stepMatch(match, [neutral, victimInput]);
    return { game, match, attacker, victim, events };
  }

  const crouched = runLaser({ ...neutral, down: true });
  assert.equal(crouched.victim.crouching, true);
  assert.equal(crouched.game.pH(crouched.victim), crouched.game.PLAYER_H * 0.5);
  assert.equal(crouched.victim.damage, 0);
  assert.equal(crouched.events.some(event => event.type === "hit"), false);

  const standing = runLaser(neutral);
  assert.equal(standing.victim.crouching, false);
  assert.equal(standing.victim.damage, standing.game.ATTACK.damage);
  assert.equal(standing.events.some(event => event.type === "hit"), true);

  const dropMatch = crouched.game.makeMatchState([0, 1], 0);
  const dropper = dropMatch.players[0];
  dropMatch.countdown = 0;
  dropper.x = 390;
  dropper.y = 455;
  dropper.vx = dropper.vy = 0;
  dropper.onGround = true;
  dropper.prev = neutral;
  crouched.game.stepMatch(dropMatch, [{ ...neutral, down: true }, neutral]);
  assert.equal(dropper.crouching, false);
  assert.equal(dropper.onGround, false);
  assert.ok(dropper.dropTimer > 0);
});

test("a charged forward beam is twice as long and hits crouching players", () => {
  const { UCHI: game } = loadGame();
  const match = game.makeMatchState([0, 1, 2], 0);
  const neutral = {
    left: false, right: false, up: false, down: false,
    jump: false, attack: false, guard: false, balloon: false, taunt: false, start: false,
  };
  const [attacker, crouchingVictim, distantVictim] = match.players;
  match.countdown = 0;
  match.itemTimer = 9999;
  attacker.x = 200;
  attacker.y = 560;
  attacker.vx = attacker.vy = 0;
  attacker.onGround = true;
  attacker.facing = 1;
  attacker.itemType = "beam";
  attacker.itemTimer = 9999;
  attacker.attackTimer = game.CHARGED_ATTACK.activeFrom + 1;
  attacker.attackIsSpecial = false;
  attacker.attackIsCharged = true;
  attacker.attackDir = "fwd";
  attacker.attackVictims = [];

  crouchingVictim.x = 300;
  crouchingVictim.y = 560;
  crouchingVictim.vx = crouchingVictim.vy = 0;
  crouchingVictim.onGround = true;
  crouchingVictim.invuln = 0;
  distantVictim.x = 1000;
  distantVictim.y = 560;
  distantVictim.vx = distantVictim.vy = 0;
  distantVictim.onGround = true;
  distantVictim.invuln = 0;

  const events = game.stepMatch(match, [neutral, { ...neutral, down: true }, neutral]);

  assert.equal(crouchingVictim.damage, game.CHARGED_ATTACK.damage);
  assert.equal(distantVictim.damage, game.CHARGED_ATTACK.damage);
  assert.equal(events.filter(event => event.type === "charged-hit").length, 2);
});

test("item duration gauge reports the remaining fraction above each player HUD", () => {
  const sandbox = loadGame();
  const { UCHI: game } = sandbox;
  const match = game.makeMatchState([0, 1, 2, 3], 0);
  match.countdown = 0;
  const itemTypes = ["reach", "speed", "beam", "giant"];

  match.players.forEach((player, index) => {
    player.itemType = itemTypes[index];
    player.itemTimer = game.ITEM.duration[player.itemType] / 2;
    assert.equal(game.itemTimeFraction(player), 0.5);
  });
  match.players[0].itemTimer = game.ITEM.duration.reach * 2;
  assert.equal(game.itemTimeFraction(match.players[0]), 1);
  match.players[0].itemTimer = 0;
  assert.equal(game.itemTimeFraction(match.players[0]), 0);

  game.APP.match = match;
  game.APP.phase = "match";
  assert.doesNotThrow(() => game.renderNow());
  assert.match(HTML, /ctx\.fillText\(seconds \+ "秒"/);
  assert.match(HTML, /const igx = x \+ 8, igy = 610, igw = panelW - 16, igh = 16/);
  assert.doesNotMatch(HTML, /足元の弧（残り時間ぶん）/);
  assert.match(HTML, /残り時間の丸型ゲージはHUDへ一本化した/);
});

test("taunt is a cosmetic ground animation that cancels on movement", () => {
  const sandbox = loadGame();
  const { UCHI: game } = sandbox;
  const match = game.makeMatchState([0, 1], 0);
  const neutral = {
    left: false, right: false, up: false, down: false,
    jump: false, attack: false, guard: false, balloon: false, taunt: false, start: false,
  };
  const player = match.players[0];
  match.countdown = 0;
  match.itemTimer = 9999;
  player.x = 640;
  player.y = 560;
  player.vx = player.vy = 0;
  player.onGround = true;
  player.invuln = 9999;

  const events = game.stepMatch(match, [{ ...neutral, taunt: true }, neutral]);
  assert.equal(events.filter(event => event.type === "taunt").length, 1);
  assert.equal(player.tauntTimer, game.TAUNT_TICKS);
  assert.equal(game.pH(player), game.PLAYER_H);
  assert.equal(player.damage, 0);

  game.APP.match = match;
  game.APP.phase = "match";
  assert.doesNotThrow(() => game.renderNow());

  game.stepMatch(match, [neutral, neutral]);
  assert.equal(player.tauntTimer, game.TAUNT_TICKS - 1);
  game.stepMatch(match, [{ ...neutral, right: true }, neutral]);
  assert.equal(player.tauntTimer, 0);
});

test("space stage applies half gravity to normal and fast falling", () => {
  const sandbox = loadGame();
  const { UCHI: game } = sandbox;
  const stageIndex = game.STAGES.findIndex(stage => stage.name === "うちゅう");
  const match = game.makeMatchState([0, 1], stageIndex);
  const player = match.players[0];
  const neutral = {
    left: false, right: false, up: false, down: false,
    jump: false, attack: false, guard: false, balloon: false, start: false,
  };
  match.countdown = 0;
  player.x = 640;
  player.y = 200;
  player.vy = 0;
  player.onGround = false;
  player.invuln = 9999;

  game.stepMatch(match, [neutral, neutral]);
  assert.equal(player.vy, game.PHYS.gravity * 0.5);

  player.vy = 1;
  game.stepMatch(match, [{ ...neutral, down: true }, neutral]);
  assert.equal(player.vy, 1 + game.PHYS.fastFallGravity * 0.5);
});

test("space stage restrains horizontal movement and has a breakable central ceiling", () => {
  const sandbox = loadGame();
  const { UCHI: game } = sandbox;
  const skyIndex = game.STAGES.findIndex(stage => stage.name === "うちゅう");
  const sky = game.makeMatchState([0, 1], skyIndex);
  const normal = game.makeMatchState([0, 1], 0);
  const neutral = {
    left: false, right: false, up: false, down: false,
    jump: false, attack: false, guard: false, balloon: false, start: false,
  };
  const right = { ...neutral, right: true };
  sky.countdown = 0;
  normal.countdown = 0;
  for (const match of [sky, normal]) {
    const player = match.players[0];
    player.x = 640;
    player.y = 200;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    player.invuln = 9999;
  }

  game.stepMatch(sky, [right, neutral]);
  game.stepMatch(normal, [right, neutral]);
  assert.equal(normal.players[0].vx, game.PHYS.airAccel);
  assert.equal(sky.players[0].vx, game.PHYS.airAccel * 0.8);

  const ceiling = sky.stage.ceiling;
  assert.equal(sky.ceilingSegments.length, ceiling.segments);
  assert.equal(sky.ceilingSegments.every(segment => !segment.broken), true);
  const player = sky.players[0];
  player.x = 640;
  player.y = ceiling.y + ceiling.h + game.PLAYER_H + 2;
  player.vx = 0;
  player.vy = -6;
  player.onGround = false;
  player.prev = neutral;
  const events = game.stepMatch(sky, [neutral, neutral]);
  assert.equal(player.y, ceiling.y + ceiling.h + game.PLAYER_H);
  assert.equal(player.vy, 0);
  assert.equal(events.filter(event => event.type === "ceiling-hit").length, 1);
  assert.equal(sky.ceilingSegments.some(segment => segment.broken), false);

  // 強い衝突は接触区画を壊し、上昇を続けて穴を通過できる。
  player.x = 640;
  player.y = ceiling.y + ceiling.h + game.PLAYER_H + 2;
  player.vy = -(ceiling.breakSpeed + 3);
  player.onGround = false;
  const breakEvents = game.stepMatch(sky, [neutral, neutral]);
  const broken = breakEvents.filter(event => event.type === "ceiling-break");
  assert.ok(broken.length >= 1);
  assert.ok(broken.every(event => event.impactSpeed >= ceiling.breakSpeed));
  assert.ok(player.vy < 0);
  const brokenSegment = sky.ceilingSegments.find(segment => segment.broken);
  assert.ok(brokenSegment);
  sandbox.handleEvents(breakEvents);
  assert.ok(game.fx.particles.length >= broken.length * 22);
  assert.ok(game.fx.shake >= 13);

  game.APP.match = sky;
  game.APP.phase = "match";
  assert.doesNotThrow(() => game.renderNow());

  player.x = brokenSegment.x + brokenSegment.w / 2;
  player.y = ceiling.y + ceiling.h + game.PLAYER_H + 2;
  player.vy = -6;
  player.onGround = false;
  const passEvents = game.stepMatch(sky, [neutral, neutral]);
  assert.equal(passEvents.some(event => event.type === "ceiling-hit"), false);
  assert.ok(player.vy < 0);

  const freshSky = game.makeMatchState([0, 1], skyIndex);
  assert.equal(freshSky.ceilingSegments.every(segment => !segment.broken), true);

  player.x = 80;
  player.y = ceiling.y + ceiling.h + game.PLAYER_H + 2;
  player.vy = -6;
  player.onGround = false;
  game.stepMatch(sky, [neutral, neutral]);
  assert.ok(player.vy < 0, "the side opening should remain passable");
});

test("space stage items enter from the side and vary their landing spots", () => {
  const sandbox = loadGame();
  const { UCHI: game } = sandbox;
  const stageIndex = game.STAGES.findIndex(stage => stage.name === "うちゅう");
  const match = game.makeMatchState([0, 1], stageIndex);
  const neutral = {
    left: false, right: false, up: false, down: false,
    jump: false, attack: false, guard: false, balloon: false, start: false,
  };
  match.countdown = 0;
  match.itemTimer = 1;

  game.stepMatch(match, [neutral, neutral]);
  assert.equal(match.items.length, 1);
  const item = match.items[0];
  assert.equal(item.arc, true);
  assert.ok(item.x < 0 || item.x > 1280);
  assert.equal(Math.sign(item.vx), item.x < 0 ? 1 : -1);
  assert.ok(item.vy < 0);
  const targetPlatform = match.platforms[item.targetPlatformIndex];
  assert.ok(targetPlatform);
  assert.ok(item.targetX > targetPlatform.x);
  assert.ok(item.targetX < targetPlatform.x + targetPlatform.w);

  const previousX = item.x;
  const previousY = item.y;
  const previousVy = item.vy;
  game.stepMatch(match, [neutral, neutral]);
  assert.equal(item.x, previousX + item.vx);
  assert.equal(item.vy, previousVy + game.ITEM.gravity);
  assert.equal(item.y, previousY + item.vy);

  const landingXs = new Set();
  const targetPlatforms = new Set();
  for (let spawn = 0; spawn < 12; spawn++) {
    match.items.length = 0;
    match.itemTimer = 1;
    game.stepMatch(match, [neutral, neutral]);
    const flyingItem = match.items[0];
    assert.ok(flyingItem);
    targetPlatforms.add(flyingItem.targetPlatformIndex);

    for (let tick = 0; tick < 240 && !flyingItem.landed; tick++) {
      for (const player of match.players) {
        player.x = -220;
        player.y = 0;
        player.vx = 0;
        player.vy = 0;
        player.onGround = true;
        player.invuln = 9999;
      }
      game.stepMatch(match, [neutral, neutral]);
    }
    assert.equal(flyingItem.landed, true);
    landingXs.add(Math.round(flyingItem.x));
  }
  assert.ok(targetPlatforms.size >= 6);
  assert.ok(landingXs.size >= 6);
});

test("flow tower walls can carry a standing player with the moving ground", () => {
  const sandbox = loadGame();
  const { UCHI: game } = sandbox;
  const stageIndex = game.STAGES.findIndex(stage => stage.name === "ながれの塔");
  const match = game.makeMatchState([0, 1], stageIndex);
  const player = match.players[0];
  const neutral = {
    left: false, right: false, up: false, down: false,
    jump: false, attack: false, guard: false, balloon: false, start: false,
  };
  match.countdown = 0;
  match.wallPhase = 0.8;
  match.wallVel = match.stage.wallSpeed;
  player.x = 370;
  player.y = 536;
  player.vy = 5;
  player.onGround = false;
  player.invuln = 9999;

  game.stepMatch(match, [neutral, neutral]);
  const wall = match.walls[0];
  assert.equal(player.onGround, true);
  assert.equal(player.y, wall.top);

  const previousX = player.x;
  game.stepMatch(match, [neutral, neutral]);
  assert.equal(player.onGround, true);
  assert.equal(player.y, wall.top);
  assert.ok(Math.abs((player.x - previousX) - wall.dx) < 1e-9);
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

test("player bodies push apart horizontally and cannot overlap", () => {
  const { UCHI: game } = loadGame();
  const match = game.makeMatchState([0, 1, 2, 3], 0);
  const neutral = {
    left: false, right: false, up: false, down: false,
    jump: false, attack: false, guard: false, balloon: false, start: false,
  };
  match.countdown = 0;
  match.itemTimer = 9999;
  for (const player of match.players) {
    player.x = 640;
    player.y = 560;
    player.vx = player.slot % 2 === 0 ? 3 : -3;
    player.vy = 0;
    player.onGround = true;
    player.invuln = 9999;
  }

  game.stepMatch(match, match.players.map(() => neutral));

  const ordered = [...match.players].sort((a, b) => a.x - b.x);
  for (let i = 1; i < ordered.length; i++) {
    assert.ok(ordered[i].x - ordered[i - 1].x >= game.PLAYER_W - 1e-9);
  }
  assert.equal(new Set(match.players.map(player => Math.round(player.x * 1000))).size, 4);
});

test("giant players use their expanded body size for collisions", () => {
  const { UCHI: game } = loadGame();
  const match = game.makeMatchState([0, 1], 0);
  const [giant, normal] = match.players;
  giant.itemType = "giant";
  giant.itemTimer = 9999;
  giant.x = normal.x = 640;
  giant.y = normal.y = 560;
  giant.vx = normal.vx = 0;
  giant.vy = normal.vy = 0;
  giant.onGround = normal.onGround = true;

  game.resolvePlayerCollisions(match.players);

  const requiredDistance = game.PLAYER_W * 0.5 * 1.6 + game.PLAYER_W * 0.5;
  assert.ok(Math.abs(giant.x - normal.x) >= requiredDistance);
});

test("a post-hit body collision cannot push a floor-supported victim through the stage", () => {
  const { UCHI: game } = loadGame();
  const match = game.makeMatchState([0, 1], 0);
  const neutral = {
    left: false, right: false, up: false, down: false,
    jump: false, attack: false, guard: false, balloon: false, taunt: false, start: false,
  };
  const [attacker, victim] = match.players;
  match.countdown = 0;
  match.itemTimer = 9999;

  attacker.x = 520;
  attacker.y = 516;
  attacker.vx = attacker.vy = 0;
  attacker.onGround = false;
  attacker.facing = 1;
  attacker.invuln = 0;
  attacker.attackTimer = game.ATTACK.activeFrom + 1;
  attacker.attackDir = "fwd";
  attacker.attackVictims = [];

  victim.x = 520;
  victim.y = 560;
  victim.vx = victim.vy = 0;
  victim.onGround = true;
  victim.invuln = 0;
  victim.itemType = "giant";
  victim.itemTimer = 9999;

  const events = game.stepMatch(match, [neutral, neutral]);

  assert.equal(events.some(event => event.type === "hit"), true);
  assert.equal(victim.y, 560);
  assert.ok(victim.vy < 0);
  assert.equal(victim.onGround, false);
});

test("the final floor safety net restores only downward crossings and preserves upward launch", () => {
  const { UCHI: game } = loadGame();
  const match = game.makeMatchState([0, 1], 0);
  const player = match.players[0];
  match.players[1].alive = false;
  const platform = match.platforms.find(candidate => candidate.main);
  const x = platform.x + platform.w / 2;
  const surfaceY = game.platformYAt(platform, x);

  player.x = x;
  player.y = surfaceY + 18;
  player.vy = 5;
  player.onGround = false;
  game.resolveFloorPenetrations(
    match.players,
    [{ x, y: surfaceY }, { x: match.players[1].x, y: match.players[1].y }],
    match.platforms,
    match.walls,
  );
  assert.equal(player.y, surfaceY);
  assert.equal(player.vy, 0);
  assert.equal(player.onGround, true);

  player.y = surfaceY + 18;
  player.vy = -7;
  player.onGround = false;
  game.resolveFloorPenetrations(
    match.players,
    [{ x, y: surfaceY }, { x: match.players[1].x, y: match.players[1].y }],
    match.platforms,
    match.walls,
  );
  assert.equal(player.y, surfaceY);
  assert.equal(player.vy, -7);
  assert.equal(player.onGround, false);
});

test("a falling player lands on a grounded player's head", () => {
  const { UCHI: game } = loadGame();
  const match = game.makeMatchState([0, 1], 0);
  const neutral = {
    left: false, right: false, up: false, down: false,
    jump: false, attack: false, guard: false, balloon: false, start: false,
  };
  const upper = match.players[0], lower = match.players[1];
  match.countdown = 0;
  match.itemTimer = 9999;
  upper.x = lower.x = 640;
  upper.y = 514;
  upper.vx = upper.vy = 0;
  upper.onGround = false;
  lower.y = 560;
  lower.vx = lower.vy = 0;
  lower.onGround = true;
  upper.invuln = lower.invuln = 9999;

  game.stepMatch(match, [neutral, neutral]);

  assert.ok(upper.y <= lower.y - game.PLAYER_H);
  assert.equal(upper.vy, lower.vy);
  assert.equal(upper.onGround, true);
  assert.equal(upper.airJumps, game.PHYS.airJumps);
});

test("down attacks deal 1.2x damage and launch vertically based on grounded state", () => {
  const neutral = {
    left: false, right: false, up: false, down: false,
    jump: false, attack: false, guard: false, balloon: false, start: false,
  };

  function runDownHit(grounded) {
    const sandbox = loadGame();
    const { UCHI: game } = sandbox;
    const match = game.makeMatchState([0, 1], 0);
    const attacker = match.players[0];
    const victim = match.players[1];
    match.countdown = 0;
    match.itemTimer = 9999;

    attacker.x = 640;
    attacker.y = 300;
    attacker.vx = 0;
    attacker.vy = 0;
    attacker.onGround = false;
    attacker.attackTimer = game.ATTACK.activeFrom + 1;
    attacker.attackIsSpecial = false;
    attacker.attackDir = "down";
    attacker.attackVictims = [];

    victim.x = 640;
    victim.y = grounded ? 350 : 340;
    victim.vx = 0;
    victim.vy = 0;
    victim.onGround = grounded;
    victim.invuln = 0;

    const events = game.stepMatch(match, [neutral, neutral]);
    return { game, attacker, victim, events };
  }

  const airborne = runDownHit(false);
  const expectedDamage = airborne.game.ATTACK.damage * airborne.game.DOWN_ATTACK.damageMult;
  const expectedKb = airborne.game.ATTACK.kbBase + expectedDamage * airborne.game.ATTACK.kbScale;
  assert.ok(Math.abs(airborne.victim.damage - expectedDamage) < 1e-9);
  assert.ok(Math.abs(airborne.attacker.damageDealt - expectedDamage) < 1e-9);
  assert.equal(airborne.victim.vx, 0);
  assert.ok(Math.abs(airborne.victim.vy - expectedKb) < 1e-9);
  assert.equal(airborne.events.find(event => event.type === "hit").launchY, 1);

  const grounded = runDownHit(true);
  assert.ok(Math.abs(grounded.victim.damage - expectedDamage) < 1e-9);
  assert.equal(grounded.victim.vx, 0);
  assert.ok(Math.abs(grounded.victim.vy + expectedKb * grounded.game.DOWN_ATTACK.groundedUpKbMult) < 1e-9);
  assert.equal(grounded.events.find(event => event.type === "hit").launchY, -1);
});

test("normal down attacks become active after one startup tick", () => {
  const sandbox = loadGame();
  const { UCHI: game } = sandbox;
  const match = game.makeMatchState([0, 1], 0);
  const attacker = match.players[0];
  const victim = match.players[1];
  const neutral = {
    left: false, right: false, up: false, down: false,
    jump: false, attack: false, guard: false, balloon: false, taunt: false, start: false,
  };
  match.countdown = 0;
  match.itemTimer = 9999;
  attacker.x = victim.x = 640;
  attacker.y = 300;
  victim.y = 350;
  attacker.vx = attacker.vy = victim.vx = victim.vy = 0;
  attacker.onGround = victim.onGround = false;
  victim.invuln = 0;

  game.stepMatch(match, [{ ...neutral, down: true, attack: true }, neutral]);
  game.stepMatch(match, [{ ...neutral, down: true }, neutral]);
  assert.equal(attacker.attackTimer, game.ATTACK.total);
  assert.equal(victim.damage, 0);

  const events = game.stepMatch(match, [{ ...neutral, down: true }, neutral]);
  assert.equal(attacker.attackTimer, game.ATTACK.total - game.DOWN_ATTACK.startupTicks);
  assert.equal(victim.damage, game.ATTACK.damage * game.DOWN_ATTACK.damageMult);
  assert.equal(events.some(event => event.type === "hit"), true);
});

test("charge release selects normal, mid, and full tiers at 50 and 100 percent", () => {
  const neutral = {
    left: false, right: false, up: false, down: false,
    jump: false, attack: false, guard: false, balloon: false, taunt: false, start: false,
  };

  function chargeFor(ticks) {
    const sandbox = loadGame();
    const { UCHI: game } = sandbox;
    const match = game.makeMatchState([0, 1], 0);
    match.countdown = 0;
    match.itemTimer = 9999;
    for (const player of match.players) {
      player.invuln = 9999;
      player.x += player.slot * 400;
    }
    const attacker = match.players[0];
    for (let tick = 0; tick < ticks; tick++) {
      game.stepMatch(match, [{ ...neutral, attack: true }, neutral]);
    }
    if (ticks < game.SPECIAL_CHARGE) game.stepMatch(match, [neutral, neutral]);
    return { game, attacker };
  }

  const belowHalf = chargeFor(59);
  assert.equal(belowHalf.attacker.attackTimer, belowHalf.game.ATTACK.total);
  assert.equal(belowHalf.attacker.attackIsCharged, false);
  assert.equal(belowHalf.attacker.attackIsSpecial, false);
  assert.equal(belowHalf.game.attackData(belowHalf.attacker), belowHalf.game.ATTACK);

  const atHalf = chargeFor(60);
  assert.equal(atHalf.attacker.attackTimer, atHalf.game.CHARGED_ATTACK.total);
  assert.equal(atHalf.attacker.attackIsCharged, true);
  assert.equal(atHalf.attacker.attackIsSpecial, false);
  assert.equal(atHalf.game.attackData(atHalf.attacker), atHalf.game.CHARGED_ATTACK);

  const belowFull = chargeFor(119);
  assert.equal(belowFull.attacker.attackIsCharged, true);
  assert.equal(belowFull.attacker.attackIsSpecial, false);

  const full = chargeFor(120);
  assert.equal(full.attacker.attackTimer, full.game.SPECIAL.total);
  assert.equal(full.attacker.attackIsCharged, false);
  assert.equal(full.attacker.attackIsSpecial, true);
  assert.equal(full.game.attackData(full.attacker), full.game.SPECIAL);
});

test("mid charge deals 16 damage and strengthened full charge deals 27", () => {
  function hitWithTier(tier) {
    const sandbox = loadGame();
    const { UCHI: game } = sandbox;
    const match = game.makeMatchState([0, 1], 0);
    const attacker = match.players[0];
    const victim = match.players[1];
    const neutral = {
      left: false, right: false, up: false, down: false,
      jump: false, attack: false, guard: false, balloon: false, taunt: false, start: false,
    };
    const attack = tier === "full" ? game.SPECIAL : tier === "mid" ? game.CHARGED_ATTACK : game.ATTACK;
    match.countdown = 0;
    match.itemTimer = 9999;
    attacker.x = 600;
    attacker.y = 560;
    attacker.vx = attacker.vy = 0;
    attacker.onGround = true;
    attacker.facing = 1;
    attacker.attackTimer = attack.activeFrom + 1;
    attacker.attackIsSpecial = tier === "full";
    attacker.attackIsCharged = tier === "mid";
    attacker.attackDir = "fwd";
    attacker.attackVictims = [];
    victim.x = 650;
    victim.y = 560;
    victim.vx = victim.vy = 0;
    victim.onGround = true;
    victim.invuln = 0;

    const events = game.stepMatch(match, [neutral, neutral]);
    return { game, victim, events };
  }

  const normal = hitWithTier("normal");
  const mid = hitWithTier("mid");
  const full = hitWithTier("full");
  assert.equal(normal.victim.damage, 8);
  assert.equal(mid.victim.damage, 16);
  assert.equal(full.victim.damage, 27);
  assert.equal(mid.events.some(event => event.type === "charged-hit"), true);
  assert.equal(full.events.some(event => event.type === "special-hit"), true);
});

test("knockouts after time up do not reduce remaining stocks", () => {
  const { UCHI: game } = loadGame();
  const match = game.makeMatchState([0, 1], 0);
  const neutral = {
    left: false, right: false, up: false, down: false,
    jump: false, attack: false, guard: false, balloon: false, taunt: false, start: false,
  };
  match.countdown = 0;
  match.timeLeft = 1;
  match.itemTimer = 9999;
  for (const player of match.players) {
    player.vx = 0;
    player.vy = 0;
    player.invuln = 9999;
  }

  game.stepMatch(match, [neutral, neutral]);
  assert.equal(match.timeUp, true);
  assert.equal(match.ending, true);
  const timedUpStocks = match.players.map(player => player.stocks);

  const target = match.players[0];
  target.x = game.BLAST.right + 1;
  const events = game.stepMatch(match, [neutral, neutral]);

  assert.equal(events.some(event => event.type === "ko" && event.slot === target.slot), true);
  assert.deepEqual(match.players.map(player => player.stocks), timedUpStocks);
  assert.equal(target.alive, true);
});

test("lobby controls open in a modal and pause lobby input", () => {
  const sandbox = loadGame();
  const { UCHI: game } = sandbox;
  const helpOpen = sandbox.document.getElementById("help-open");
  const helpModal = sandbox.document.getElementById("help-modal");
  assert.match(HTML, /role="dialog" aria-modal="true"/);
  assert.match(HTML, /参加：F（左キーボード）／ L（右キーボード）／ パッドは設定した攻撃ボタン/);
  assert.match(HTML, /id="gamepad-config" hidden/);
  assert.match(HTML, /data-pad-action="attack"/);
  assert.match(HTML, /data-pad-action="stagePrev"/);
  assert.match(HTML, /data-pad-action="stageNext"/);
  assert.match(HTML, /data-pad-action="start"/);
  assert.match(HTML, /rect\.height \* \(682 \/ H\)/);

  sandbox.setLobbyHelpOpen(true);
  assert.equal(helpModal.hidden, false);
  assert.equal(helpOpen.hidden, true);

  sandbox.openGamepadConfig();
  assert.equal(sandbox.document.getElementById("gamepad-config").hidden, false);
  assert.match(sandbox.document.getElementById("pad-config-status").textContent, /ゲームパッドを接続/);
  sandbox.closeGamepadConfig();

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

test("ice slopes carry players while acceleration and stopping remain slippery", () => {
  const sandbox = loadGame();
  const { UCHI: game } = sandbox;
  const iceIndex = game.STAGES.findIndex(stage => stage.name === "こおり");
  const ice = game.makeMatchState([0, 1], iceIndex);
  const plaza = game.makeMatchState([0, 1], 0);
  const neutral = {
    left: false, right: false, up: false, down: false,
    jump: false, attack: false, guard: false, balloon: false, taunt: false, start: false,
  };
  ice.countdown = plaza.countdown = 0;
  ice.itemTimer = plaza.itemTimer = 9999;

  const leftSlope = ice.platforms.find(platform => platform.main && platform.slope > 0);
  const rightSlope = ice.platforms.find(platform => platform.main && platform.slope < 0);
  assert.equal(game.platformYAt(leftSlope, leftSlope.x), 500);
  assert.equal(game.platformYAt(leftSlope, leftSlope.x + leftSlope.w), 590);
  assert.equal(game.platformYAt(rightSlope, rightSlope.x), 590);
  assert.equal(game.platformYAt(rightSlope, rightSlope.x + rightSlope.w), 500);

  const icePlayer = ice.players[0];
  icePlayer.x = 280;
  icePlayer.y = game.platformYAt(leftSlope, icePlayer.x);
  icePlayer.vx = icePlayer.vy = 0;
  icePlayer.onGround = true;
  icePlayer.invuln = 9999;
  const plazaPlayer = plaza.players[0];
  plazaPlayer.x = 420;
  plazaPlayer.y = 560;
  plazaPlayer.vx = plazaPlayer.vy = 0;
  plazaPlayer.onGround = true;
  plazaPlayer.invuln = 9999;

  game.stepMatch(ice, [{ ...neutral, right: true }, neutral]);
  game.stepMatch(plaza, [{ ...neutral, right: true }, neutral]);
  assert.ok(icePlayer.vx < plazaPlayer.vx, "ice should build speed more slowly");
  assert.equal(icePlayer.onGround, true);
  assert.ok(Math.abs(icePlayer.y - game.platformYAt(leftSlope, icePlayer.x)) < 1e-9);

  icePlayer.vx = plazaPlayer.vx = 5;
  icePlayer.prev = plazaPlayer.prev = neutral;
  game.stepMatch(ice, [neutral, neutral]);
  game.stepMatch(plaza, [neutral, neutral]);
  assert.ok(icePlayer.vx > plazaPlayer.vx, "ice should retain more momentum while stopping");
  game.stepMatch(ice, [{ ...neutral, left: true }, neutral]);
  assert.ok(icePlayer.vx > 0, "one reverse input should not instantly reverse an ice slide");
});

test("a player knocked toward the uphill side cannot tunnel through an ice slope", () => {
  const { UCHI: game } = loadGame();
  const iceIndex = game.STAGES.findIndex(stage => stage.name === "こおり");
  const match = game.makeMatchState([0, 1], iceIndex);
  const neutral = {
    left: false, right: false, up: false, down: false,
    jump: false, attack: false, guard: false, balloon: false, taunt: false, start: false,
  };
  match.countdown = 0;
  match.itemTimer = 9999;
  const slope = match.platforms.find(platform => platform.main && platform.slope > 0);
  const player = match.players[0];
  player.x = 550;
  player.y = game.platformYAt(slope, player.x) - 2;
  player.vx = -20;
  player.vy = 8;
  player.onGround = false;
  player.invuln = 9999;
  match.players[1].invuln = 9999;

  game.stepMatch(match, [neutral, neutral]);

  assert.equal(player.onGround, true);
  assert.ok(Math.abs(player.y - game.platformYAt(slope, player.x)) < 1e-9);
});

test("a sliding player transfers across the center seam without sinking below the ice", () => {
  const { UCHI: game } = loadGame();
  const iceIndex = game.STAGES.findIndex(stage => stage.name === "こおり");
  const match = game.makeMatchState([0, 1], iceIndex);
  const neutral = {
    left: false, right: false, up: false, down: false,
    jump: false, attack: false, guard: false, balloon: false, taunt: false, start: false,
  };
  match.countdown = 0;
  match.itemTimer = 9999;
  const leftSlope = match.platforms.find(platform => platform.main && platform.slope > 0);
  const rightSlope = match.platforms.find(platform => platform.main && platform.slope < 0);
  const player = match.players[0];
  player.x = 635;
  player.y = game.platformYAt(leftSlope, player.x);
  player.vx = 15;
  player.vy = 0;
  player.onGround = true;
  player.invuln = 9999;
  match.players[1].invuln = 9999;

  game.stepMatch(match, [neutral, neutral]);

  assert.ok(player.x > 640);
  assert.equal(player.onGround, true, "the player should stay attached while crossing the V-shaped seam");
  assert.ok(Math.abs(player.y - game.platformYAt(rightSlope, player.x)) < 1e-9);
});

test("ice stage can be opened directly from its preview URL", () => {
  const { UCHI: game } = loadGame("?stage=%E3%81%93%E3%81%8A%E3%82%8A");
  assert.equal(game.STAGES[game.APP.stageIndex].name, "こおり");
});

test("landing on a charging penguin from above reverses it without taking damage", () => {
  const { UCHI: game } = loadGame();
  const iceIndex = game.STAGES.findIndex(stage => stage.name === "こおり");
  const match = game.makeMatchState([0, 1], iceIndex);
  const neutral = {
    left: false, right: false, up: false, down: false,
    jump: false, attack: false, guard: false, balloon: false, taunt: false, start: false,
  };
  const [player, spectator] = match.players;
  const penguin = match.penguin;
  const mainPlatforms = match.platforms.filter(platform => platform.main);
  match.countdown = 0;
  match.itemTimer = 9999;
  spectator.alive = false;

  penguin.state = "charge";
  penguin.x = 400;
  penguin.y = game.mainSurfaceYAt(match, penguin.x);
  penguin.dir = 1;
  penguin.platformIndex = -1;
  penguin.lane = "main";
  penguin.airborne = false;
  penguin.exitLeftEdge = Math.min(...mainPlatforms.map(platform => platform.x));
  penguin.exitRightEdge = Math.max(...mainPlatforms.map(platform => platform.x + platform.w));

  const nextPenguinX = penguin.x + game.PENGUIN.speed;
  const nextPenguinY = game.mainSurfaceYAt(match, nextPenguinX);
  player.x = nextPenguinX;
  player.y = nextPenguinY - game.PENGUIN.chargeHeight - 4;
  player.vx = 0;
  player.vy = 4;
  player.onGround = false;
  player.invuln = 0;

  const events = game.stepMatch(match, [neutral, neutral]);

  assert.equal(penguin.dir, -1);
  assert.equal(player.damage, 0);
  assert.equal(player.y, penguin.y - game.PENGUIN.chargeHeight);
  assert.equal(player.vy, game.PENGUIN.stompBounce);
  assert.equal(player.onGround, false);
  assert.equal(events.some(event => event.type === "penguin-turn" && event.slot === player.slot), true);
  assert.equal(events.some(event => event.type === "penguin-hit"), false);
});

test("penguin appears, warns, belly-charges, and alternates between ground and upper ice", () => {
  const sandbox = loadGame();
  const { UCHI: game } = sandbox;
  const iceIndex = game.STAGES.findIndex(stage => stage.name === "こおり");
  const match = game.makeMatchState([0, 1], iceIndex);
  const neutral = {
    left: false, right: false, up: false, down: false,
    jump: false, attack: false, guard: false, balloon: false, taunt: false, start: false,
  };
  match.countdown = 0;
  match.itemTimer = 9999;
  const penguin = match.penguin;
  assert.ok(penguin);

  // 1段階目: 地面の入口へ姿を現す（まだビックリマークも突進もない）。
  penguin.timer = 1;
  for (const player of match.players) {
    player.x = 900;
    player.y = game.mainSurfaceYAt(match, player.x);
    player.vx = player.vy = 0;
    player.onGround = true;
    player.invuln = 9999;
  }
  const appearEvents = game.stepMatch(match, [neutral, neutral]);
  assert.equal(penguin.state, "appear");
  assert.equal(penguin.lane, "main");
  assert.equal(penguin.platformIndex, -1);
  assert.equal(appearEvents.some(event => event.type === "penguin-appear"), true);

  // 2段階目: 「!」警告へ移る。
  penguin.timer = 1;
  const warnEvents = game.stepMatch(match, [neutral, neutral]);
  assert.equal(penguin.state, "warn");
  assert.equal(warnEvents.some(event => event.type === "penguin-warn"), true);

  // 3段階目: 腹ばい突撃へ移る。
  penguin.timer = 1;
  const chargeEvents = game.stepMatch(match, [neutral, neutral]);
  assert.equal(penguin.state, "charge");
  assert.equal(chargeEvents.some(event => event.type === "penguin-charge"), true);

  const target = match.players[0];
  target.x = penguin.x + 30;
  target.y = game.mainSurfaceYAt(match, target.x);
  target.invuln = 0;
  const hitEvents = game.stepMatch(match, [neutral, neutral]);
  assert.equal(target.damage, game.PENGUIN.damage);
  assert.ok(target.vx > 0);
  assert.ok(target.vy < 0);
  assert.equal(hitEvents.some(event => event.type === "penguin-hit"), true);

  game.APP.match = match;
  game.APP.phase = "match";
  assert.doesNotThrow(() => game.renderNow());

  // 退場後は間隔を空け、次の出現場所を上段足場へ切り替える。
  penguin.x = penguin.rightEdge + game.PENGUIN.width;
  penguin.state = "charge";
  penguin.dir = 1;
  match.hitstop = 0;
  game.stepMatch(match, [neutral, neutral]);
  assert.equal(penguin.state, "wait");
  assert.equal(penguin.timer, game.PENGUIN.waitTicks);
  assert.equal(penguin.passes, 1);

  penguin.timer = 1;
  const upperAppearEvents = game.stepMatch(match, [neutral, neutral]);
  assert.equal(penguin.state, "appear");
  assert.equal(penguin.lane, "upper");
  assert.ok(penguin.platformIndex >= 0);
  const upperPlatformIndex = penguin.platformIndex;
  const upperPlatform = match.platforms[upperPlatformIndex];
  assert.notEqual(upperPlatform.main, true);
  assert.equal(penguin.y, game.platformYAt(upperPlatform, penguin.x));
  assert.equal(upperAppearEvents.some(event => event.type === "penguin-appear" && event.lane === "upper"), true);

  // 上段から突進した回も、足場の端で消えず、慣性を保って落下→地面走行→画面外まで進む。
  penguin.timer = 1;
  game.stepMatch(match, [neutral, neutral]);
  penguin.timer = 1;
  game.stepMatch(match, [neutral, neutral]);
  assert.equal(penguin.state, "charge");

  let takeoffTicks = 0;
  while (!penguin.airborne && takeoffTicks++ < 90) game.stepMatch(match, [neutral, neutral]);
  assert.equal(penguin.airborne, true);
  assert.equal(penguin.platformIndex, upperPlatformIndex);
  const airborneX = penguin.x;
  const airborneY = penguin.y;
  const firstAirborneEvents = game.stepMatch(match, [neutral, neutral]);
  assert.equal(penguin.x - airborneX, game.PENGUIN.speed * penguin.dir);
  assert.ok(penguin.y > airborneY);

  const landingEvents = [...firstAirborneEvents];
  let fallTicks = 0;
  while (penguin.airborne && fallTicks++ < 120) {
    landingEvents.push(...game.stepMatch(match, [neutral, neutral]));
  }
  assert.equal(penguin.airborne, false);
  assert.equal(penguin.lane, "main");
  assert.equal(penguin.platformIndex, -1);
  assert.equal(landingEvents.some(event => event.type === "penguin-land"), true);
  assert.ok(Math.abs(penguin.y - game.mainSurfaceYAt(match, penguin.x)) < 1e-9);

  let exitTicks = 0;
  while (penguin.state === "charge" && exitTicks++ < 160) game.stepMatch(match, [neutral, neutral]);
  assert.equal(penguin.state, "wait");
  assert.equal(penguin.passes, 2);
  assert.ok(penguin.x > penguin.exitRightEdge + game.PENGUIN.width);
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
