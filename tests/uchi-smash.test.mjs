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
  assert.match(HTML, /const GAME_VERSION = "0\.9\.13"/);
  assert.match(HTML, /リーチ・速度・ビーム・巨大化・風船補充の5種類/);
  assert.equal(game.PHYS.gravity, 0.495);
  assert.equal(game.DOWN_ATTACK.damageMult, 1.2);
  assert.equal(game.DOWN_ATTACK.groundedUpKbMult, 1.3);
  assert.equal(game.BODY_COLLISION.passes, 32);
  assert.equal(game.STAGES.length, 6);
  assert.equal(new Set(game.STAGES.map(stage => stage.name)).size, 6);
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
  assert.equal(typeof sandbox.makeKeyboardSource(0).sample, "function");
  assert.equal(typeof sandbox.makeGamepadSource(0).sample, "function");
  assert.equal(game.makeMatchState([0, 1], 0).timeLeft, 10800);
  for (let byte = 0; byte < 256; byte++) {
    assert.equal(game.encodeSample(game.decodeSample(byte)), byte);
  }
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
