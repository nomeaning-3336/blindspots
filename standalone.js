(() => {
  const APP_NAME = "Chessview";
  const ENGINE_NAME = "Stockfish 18 Lite";
  const LEGACY_BASE_RAW = String(
    globalThis.__CHESS_SOMETHING_BASE_PATH__ || "",
  ).trim();
  const LEGACY_BASE = LEGACY_BASE_RAW
    ? LEGACY_BASE_RAW.replace(/\/+$/, "")
    : ".";
  const EMBEDDED_MODE = LEGACY_BASE !== ".";
  const assetUrl = (path) => {
    const cleanPath = String(path || "").replace(/^\.?\//, "");
    return LEGACY_BASE === "." ? `./${cleanPath}` : `${LEGACY_BASE}/${cleanPath}`;
  };
  const ENGINE_SCRIPT = assetUrl("stockfish.js");
  const OPENING_BOOK_URL = assetUrl("opening-book.json");
  const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const PIECE_BASE = assetUrl("pieces/cburnett");
  const INIT_NS = "[chesssomething:init]";
  const WIKIBOOKS_API_URL = "https://en.wikibooks.org/w/api.php";
  const WIKIBOOKS_TITLE_PREFIX = "Chess_Opening_Theory";
  const LICHESS_SPEEDS = "blitz";
  const LICHESS_RATINGS = "1000,1200,1400,1600,1800,2000,2200,2500";
  const TIMED_ANALYSIS_PUBLISH_SCHEDULE = [1600, 3250, 5000];
  const RECENT_IMPORT_CACHE_MS = 2 * 60 * 1000;
  const PIECE_CACHE_PASSES = [120, 350];
  const NEXT_PLY_CACHE_MOVETIME = 300;
  const NEXT_PLY_CACHE_LIMIT = 12;
  const POSITION_CACHE_MOVETIME = 300;
  const MAX_CACHED_POSITIONS = 200;
  const PERSISTED_CACHE_POSITIONS = 120;
  const PIECE_CACHE_HASH = 8;
  const MAX_ENGINE_THREADS = Math.max(
    1,
    Math.min(32, Number(globalThis.navigator?.hardwareConcurrency) || 8),
  );
  const ARCADE_VARIANTS = {
    vanilla: {
      key: "vanilla",
      label: "Vanilla",
      title: "Arcade · Vanilla",
      description:
        "Play standard chess against a human-like opponent at an Elo of your choosing.",
      playerColor: "white",
      aiColor: "black",
      playerName: "You",
      aiName: "Opponent",
      opponentElo: 1500,
      modelType: "blitz",
      topK: 8,
      topMoves: 6,
      temperature: 0.9,
      mode: "maia-fixed",
    },
    drunkfish: {
      key: "drunkfish",
      label: "Drunkfish",
      title: "Arcade · Drunkfish",
      description:
        "Play standard chess against a human-like opponent whose strength keeps lurching during the game.",
      playerColor: "white",
      aiColor: "black",
      playerName: "You",
      aiName: "Drunkfish",
      opponentElo: 1500,
      modelType: "blitz",
      topK: 10,
      topMoves: 8,
      temperature: 1,
      mode: "maia-drift",
    },
    weirdhorse: {
      key: "weirdhorse",
      label: "Weirdhorse",
      title: "Arcade · Weirdhorse",
      description:
        "Every 10 plies the horse law changes. Knights must obey the current strange jump card shown in the side panel.",
      playerColor: "white",
      aiColor: "black",
      playerName: "You",
      aiName: "Opponent",
      opponentElo: 1500,
      modelType: "blitz",
      topK: 8,
      topMoves: 6,
      temperature: 1,
      mode: "weirdhorse",
    },
  };
  const WEIRDHORSE_PROFILES = (() => {
    const pairNames = [
      "Canter",
      "Gallop",
      "Spiral",
      "Meteor",
      "Forklift",
      "Sidekick",
      "Corkscrew",
      "Thunder",
      "Zebra",
      "Camel",
      "Meteoric",
      "Crane",
      "Harpoon",
      "Hook",
      "Bouncer",
      "Orbit",
      "Riptide",
      "Longleg",
      "Pogo",
      "Rocket",
      "Echo",
      "Stomp",
      "Quasar",
      "Laser",
      "Mirage",
    ];
    const styleNames = ["Canter", "Gallop", "Stampede", "Prance"];
    const basePairs = [
      [1, 2],
      [1, 3],
      [1, 4],
      [1, 5],
      [2, 1],
      [2, 2],
      [2, 3],
      [2, 4],
      [2, 5],
      [3, 1],
      [3, 2],
      [3, 3],
      [3, 4],
      [3, 5],
      [4, 1],
      [4, 2],
      [4, 3],
      [4, 4],
      [4, 5],
      [5, 1],
      [5, 2],
      [5, 3],
      [5, 4],
      [5, 5],
      [1, 1],
    ];
    const uniqueOffsets = (offsets) => {
      const map = new Map();
      offsets.forEach(([dx, dy]) => {
        if (!dx && !dy) return;
        map.set(`${dx},${dy}`, { dx, dy });
      });
      return Array.from(map.values());
    };
    return basePairs.flatMap(([dx, dy], index) => {
      const baseLabel = pairNames[index] || `Horse ${index + 1}`;
      const offsetSets = [
        uniqueOffsets([
          [dx, dy],
          [dx, -dy],
          [-dx, dy],
          [-dx, -dy],
        ]),
        uniqueOffsets([
          [dy, dx],
          [dy, -dx],
          [-dy, dx],
          [-dy, -dx],
        ]),
        uniqueOffsets([
          [dx, dy],
          [dx, -dy],
          [-dx, dy],
          [-dx, -dy],
          [dy, dx],
          [dy, -dx],
          [-dy, dx],
          [-dy, -dx],
        ]),
        uniqueOffsets([
          [dx, dx],
          [dx, -dx],
          [-dx, dx],
          [-dx, -dx],
          [dy, dy],
          [dy, -dy],
          [-dy, dy],
          [-dy, -dy],
        ]),
      ];
      return offsetSets.map((offsets, styleIndex) => ({
        id: `horse-${index + 1}-${styleIndex + 1}`,
        label: `${baseLabel} ${styleNames[styleIndex]}`,
        shortLabel: `${dx}x${dy} ${styleNames[styleIndex]}`,
        offsets,
      }));
    });
  })();
  const BOARD_THEMES = {
    grey: {
      label: "Grey",
      light: "#E8E8E8",
      dark: "#A1A1AE",
      coord: "#666686",
    },
    light: {
      label: "Light",
      light: "#f7f0e0",
      dark: "#d9ccb5",
      coord: "#847560",
    },
    solarized: {
      label: "Solarized",
      light: "#f3ebcf",
      dark: "#c8ba98",
      coord: "#6e7c78",
    },
    forest: {
      label: "Forest",
      light: "#dce7d8",
      dark: "#7d9770",
      coord: "#4d6a53",
    },
    ocean: {
      label: "Ocean",
      light: "#dce6f2",
      dark: "#5c769a",
      coord: "#3b5678",
    },
    crimson: {
      label: "Crimson",
      light: "#f0dde2",
      dark: "#73515f",
      coord: "#a96c82",
    },
    midnight: {
      label: "Midnight",
      light: "#efe6fb",
      dark: "#6d5a8f",
      coord: "#b39ae0",
    },
  };
  const PIECE_THEMES = {
    cburnett: {
      label: "Cburnett",
      assetSet: "cburnett",
    },
    "alpha-wood": {
      label: "Alpha Wood",
      assetSet: "alpha",
    },
    maestro: {
      label: "Maestro",
      assetSet: "maestro",
    },
    smart: {
      label: "Smart",
      assetSet: "merida",
    },
    "staunty-wood": {
      label: "Staunty Wood",
      assetSet: "staunty",
    },
    governor: {
      label: "Governor",
      assetSet: "governor",
    },
    companion: {
      label: "Companion",
      assetSet: "companion",
    },
  };
  const ANALYSIS_PUBLISH_INTERVAL = 1000;
  const ANALYSIS_DEPTH_STEP = 2;
  const MOVE_CLASS_STYLES = {
    critical: {
      label: "Critical",
      color: "var(--app-class-critical)",
      soft: "var(--app-class-critical-soft)",
      border: "var(--app-class-critical-border)",
      icon: assetUrl("classification-icons/critical.png"),
    },
    brilliant: {
      label: "Brilliant",
      color: "var(--app-class-brilliant)",
      soft: "var(--app-class-brilliant-soft)",
      border: "var(--app-class-brilliant-border)",
      icon: assetUrl("classification-icons/brilliant.png"),
    },
    best: {
      label: "Best",
      color: "var(--app-class-best)",
      soft: "var(--app-class-best-soft)",
      border: "var(--app-class-best-border)",
      icon: assetUrl("classification-icons/best.png"),
    },
    excellent: {
      label: "Excellent",
      color: "var(--app-class-excellent)",
      soft: "var(--app-class-excellent-soft)",
      border: "var(--app-class-excellent-border)",
      icon: assetUrl("classification-icons/excellent.png"),
    },
    okay: {
      label: "Okay",
      color: "var(--app-class-okay)",
      soft: "var(--app-class-okay-soft)",
      border: "var(--app-class-okay-border)",
      icon: assetUrl("classification-icons/okay.png"),
    },
    inaccuracy: {
      label: "Inaccuracy",
      color: "var(--app-class-inaccuracy)",
      soft: "var(--app-class-inaccuracy-soft)",
      border: "var(--app-class-inaccuracy-border)",
      icon: assetUrl("classification-icons/inaccuracy.png"),
    },
    mistake: {
      label: "Mistake",
      color: "var(--app-class-mistake)",
      soft: "var(--app-class-mistake-soft)",
      border: "var(--app-class-mistake-border)",
      icon: assetUrl("classification-icons/mistake.png"),
    },
    blunder: {
      label: "Blunder",
      color: "var(--app-class-blunder)",
      soft: "var(--app-class-blunder-soft)",
      border: "var(--app-class-blunder-border)",
      icon: assetUrl("classification-icons/blunder.png"),
    },
  };
  const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const STORAGE = {
    apiKeyPrefix: "chess-something:coach:key:",
    modelPrefix: "chess-something:coach:model:",
    provider: "chess-something:coach:provider",
    settings: "chess-something:settings",
    analysisCache: "chess-something:analysis-cache:v1",
    boardState: "chess-something:board-state:v1",
    reviewHandoff: "chess-something:review-handoff:v1",
  };
  const BOARD_STATE_VERSION = 1;
  const INITIAL_ANALYZE_PREFERENCES =
    globalThis.__CHESSVIEW_INITIAL_ANALYZE_PREFERENCES__ || null;
  const INITIAL_COACH_SETTINGS =
    globalThis.__CHESSVIEW_INITIAL_COACH_SETTINGS__ || null;
  const INITIAL_ARCADE_GAME =
    globalThis.__CHESSVIEW_INITIAL_ARCADE_GAME__ &&
    typeof globalThis.__CHESSVIEW_INITIAL_ARCADE_GAME__ === "object"
      ? globalThis.__CHESSVIEW_INITIAL_ARCADE_GAME__
      : null;
  const getInitialWorkspaceMode = () => {
    const mode = String(globalThis.__CHESSVIEW_INITIAL_WORKSPACE_MODE__ || "")
      .trim()
      .toLowerCase();
    return mode === "arcade" || mode === "review" ? "arcade" : "explore";
  };
  const getAnalyzePreferencesPersistUrl = () =>
    globalThis.__CHESSVIEW_ANALYZE_PREFERENCES_PERSIST_URL__ || "";
  const getArcadeGamePersistUrl = () =>
    globalThis.__CHESSVIEW_ARCADE_GAME_PERSIST_URL__ || "";
  const getInitialArcadeVariantKey = () => {
    const key = String(INITIAL_ARCADE_GAME?.variantKey || "")
      .trim()
      .toLowerCase();
    return ARCADE_VARIANTS[key] ? key : "";
  };
  const SOUND_BASE = assetUrl("sounds");
  const SOUND_SOURCES = {
    move: `${SOUND_BASE}/move-self.mp3`,
    capture: `${SOUND_BASE}/capture.mp3`,
  };
  const PATTERN_THEME_COLORS = {
    short: "#6f10b0",
    endgame: "#c54130",
    middlegame: "#1a56c5",
    crushing: "#d44",
    mate: "#d93",
    advantage: "#2e7d32",
    long: "#9c27b0",
    oneMove: "#00897b",
    mateIn1: "#ff6d00",
    mateIn2: "#ff9100",
    master: "#37474f",
    fork: "var(--accent)",
    kingsideAttack: "#c62828",
    veryLong: "#6a1b9a",
    sacrifice: "#ad1457",
    advancedPawn: "#6d4c41",
    pin: "#2e7d32",
    defensiveMove: "#558b2f",
    rookEndgame: "#6d4c41",
    hangingPiece: "#c62828",
    discoveredAttack: "#00695c",
  };

  const root = document.getElementById("app");
  if (!root) return;
  // Stub so renderAll() calls during renderShell() don't crash before initialise() runs
  window.__chessSomething = { _renderCount: 0 };
  const COPY_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" viewBox="0 0 24 24" width="24" height="24"><path d="M19.33 16H10.66C8.65999 16 7.98999 15.33 7.98999 13.33V4.65999C7.98999 2.65999 8.65999 1.98999 10.66 1.98999H19.33C21.33 1.98999 22 2.65999 22 4.65999V13.33C22 15.33 21.33 16 19.33 16ZM13.33 22H4.65999C2.65999 22 1.98999 21.33 1.98999 19.33V10.66C1.98999 8.65999 2.65999 7.98999 4.65999 7.98999H5.98999V13.32C5.98999 16.82 7.15999 17.99 10.66 17.99H15.99V19.32C15.99 21.32 15.32 21.99 13.32 21.99L13.33 22Z"></path></svg>`;
  document.title = APP_NAME;
  const revealApp = () => document.documentElement.classList.add("boot-ready");
  const revealAppWhenReady = () =>
    requestAnimationFrame(() => requestAnimationFrame(revealApp));

  async function fetchJsonWithRetry(input, init = {}, options = {}) {
    const attempts = Math.max(1, Number(options.attempts) || 1);
    const retryStatuses = new Set(
      Array.isArray(options.retryStatuses) ? options.retryStatuses : [],
    );
    const retryOnInvalidJson = !!options.retryOnInvalidJson;
    const retryDelayMs = Math.max(0, Number(options.retryDelayMs) || 0);
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetch(input, init);
        const raw = await response.text();
        let payload = null;
        if (raw) {
          try {
            payload = JSON.parse(raw);
          } catch (error) {
            if (retryOnInvalidJson && attempt < attempts) {
              lastError = error;
              if (retryDelayMs) {
                await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
              }
              continue;
            }
            throw error;
          }
        }
        if (retryStatuses.has(response.status) && attempt < attempts) {
          if (retryDelayMs) {
            await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          }
          continue;
        }
        return { response, payload };
      } catch (error) {
        lastError = error;
        if (attempt >= attempts) throw error;
        if (retryDelayMs) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
    }
    throw lastError || new Error("JSON request failed");
  }

  if (typeof Chess === "undefined") {
    root.innerHTML =
      '<div style="padding:24px;color:var(--app-text);background:var(--app-panel-solid);font-family:system-ui">Chess.js did not load. Serve this folder over <code>http://localhost</code> and reload.</div>';
    revealAppWhenReady();
    return;
  }

  let nodeCounter = 0;
  let boardBound = false;
  let renderQueued = false;
  let analysisRaf = null;
  let _cachedGameFen = null;
  let _cachedGame = null;
  let _legalUciSetKey = "";
  let _legalUciSetCache = null;
  const _legalMovesForFenCache = new Map();
  const _legalUciSetForFenCache = new Map();
  const _openingBookFenKeyCache = new Map();
  const _openingBookMoveSetCache = new Map();
  let _lastHistoryHtml = "";
  let _lastEvalChartHtml = "";
  const _legalMoveCountCache = new Map();
  let _cachedCurrentPathNodeId = "";
  let _cachedCurrentPath = null;
  let _cachedCurrentPathFenSet = null;
  let _cachedVisibleHistoryPathNodeId = "";
  let _cachedVisibleHistoryPath = null;
  let _lastRenderedStatus = "";
  let _lastRenderedHint = "";
  let _lastOpeningTrailMarkup = "";
  let _overlayRafPending = false;
  let _lastBoardStructureKey = "";
  let _lastBoardDecorationKey = "";
  let _lastPiecesKey = "";
  let _lastBoardHtml = "";
  let _lastPiecesHtml = "";
  let _hoveredAnalysisRowEl = null;
  const _squareIndexCache = new Map();
  const _squareCenterCache = {
    white: new Map(),
    black: new Map(),
  };
  const _boardSquareElements = new Map();
  const _fenGameCache = new Map();
  let _lastOverlayBoardKey = "";
  let _lastOverlaySelectedSquare = null;
  let _lastOverlayDataKey = "";
  let _lastOverlayEvalMap = new Map();
  let _overlayNeedsEntrance = false;
  let _overlayGhostTimer = null;
  let _overlayEnterTimer = null;
  let _dragRafPending = false;
  let _topbarLayoutRaf = 0;
  let _cachePersistTimer = null;
  let _cachePersistIdleHandle = 0;
  let _analyzePreferencesPersistTimer = null;
  let _boardStatePersistTimer = null;
  let _arcadeGamePersistKey = "";
  let _themeDetectionTimer = null;
  let _themeDetectionSeq = 0;
  let _themeDetectionFen = "";
  let _toolEngineTask = null;
  const nodeRegistry = new Map();
  const soundBank = new Map();
  let audioCtx = null;
  let soundBankPromise = null;
  const analysisByUci = new Map();
  const _positionFeaturesCache = new Map();
  let _openingBookMoves = null;
  let _openingBookNames = null;
  let _openingBookPromise = null;
  let _openingBookVersion = 0;
  const _openingLookupPromiseCache = new Map();
  const _openingWikiLookupPromiseCache = new Map();
  const _wikibookFetchPromiseCache = new Map();
  const _analysisDisplayClassCache = new Map();

  const state = {
    orientation: "white",
    whitePlayerName: "White",
    blackPlayerName: "Black",
    whitePlayerRating: "",
    blackPlayerRating: "",
    importedWhitePlayerName: "",
    importedBlackPlayerName: "",
    importedWhitePlayerRating: "",
    importedBlackPlayerRating: "",
    playerClockByNodeId: new Map(),
    selectedSquare: null,
    root: null,
    current: null,
    hoveredUci: null,
    limitKind: "time",
    limitValue: 250,
    timeLimitValue: 250,
    depthLimitValue: 18,
    selfPlayNodes: 500,
    linesShown: 3,
    threads: 1,
    boardTheme: "midnight",
    pieceTheme: "maestro",
    engine: null,
    cacheEngine: null,
    toolEngine: null,
    engineReady: false,
    engineLoading: false,
    engineBusy: false,
    cacheEngineReady: false,
    cacheEngineLoading: false,
    cacheEngineBusy: false,
    toolEngineReady: false,
    toolEngineLoading: false,
    toolEngineBusy: false,
    stopRequested: false,
    cacheStopRequested: false,
    toolEngineStopRequested: false,
    discardEngineInfo: false,
    pendingSearch: false,
    pendingOptionSync: false,
    engineMode: "halt",
    terminalAutoHalt: false,
    engineStatus: "Loading engine",
    engineHint: `Creating ${ENGINE_NAME} worker...`,
    engineRaw: [],
    openingInfo: null,
    openingWiki: null,
    openingLoading: false,
    openingLookupKey: "",
    openingRequestId: 0,
    openingPromise: null,
    openingCache: new Map(),
    wikibookCache: new Map(),
    analysisMap: new Map(),
    analysisRows: [],
    awaitingFinalAnalysis: false,
    awaitingImportedPgnAnalysis: false,
    importedPgnReportReady: false,
    importedPgnAnalysisFens: [],
    importedPgnAnalysisMoves: [],
    importedGameReviewMode: false,
    importedGameReviewLoading: false,
    importedGameReviewRequestId: 0,
    importedGameReviewComments: new Map(),
    importedGameReviewLastNodeId: "",
    importedGameReviewLastText: "",
    importedGameReviewTypewriterText: "",
    importedGameReviewTypewriterTimer: null,
    importedGameReviewThinkingDots: 0,
    importedGameReviewThinkingTimer: null,
    cachedFullAnalysis: null,
    annotations: [],
    annotationDrag: null,
    fenPieceAnalysisCache: new Map(),
    positionAnalysisCache: new Map(),
    pieceAnalysisCache: new Map(),
    nextPlyAnalysisCache: new Map(),
    playedMoveAnalysisCache: new Map(),
    positionCacheQueue: [],
    pieceCacheKey: "",
    pieceCacheQueue: [],
    nextPlyCacheQueue: [],
    playedMoveCacheQueue: [],
    cacheTask: null,
    cacheTaskMap: new Map(),
    cacheFenOrder: new Map(),
    cacheQueueRefreshToken: 0,
    analysisPublishedAt: 0,
    analysisPublishedDepth: 0,
    analysisPublishTimer: null,
    nextTimedPublishAt: 0,
    searchRaf: 0,
    searchStartedAt: 0,
    autoStarted: false,
    silentSearchRetries: 0,
    engineLinesHidden: false,
    dragState: null,
    ignoreClicksUntil: 0,
    llmProvider: "claude",
    llmApiKey: "",
    llmModel: "claude-opus-4-6",
    llmMessages: [],
    llmConversation: [],
    llmWaiting: false,
    llmToolStatus: "",
    llmLastContextFen: "",
    llmLastContextTrail: "",
    llmExplainedFens: new Set(),
    workspaceMode: getInitialWorkspaceMode(),
    arcadeVariantKey: getInitialArcadeVariantKey() || "drunkfish",
    arcadeHiddenElo: 1500,
    arcadeTargetElo: 1500,
    arcadeBurstPliesLeft: 0,
    arcadeRequestId: 0,
    arcadeThinking: false,
    weirdhorseProfilesByCycle: new Map(),
    coachEnabled: false,
    importBusy: false,
    importLabel: "Importing game...",
    recentImportState: "idle",
    recentImportGames: [],
    recentImportMessage: "",
    recentImportProfileLabel: "",
    recentImportSignInHref: "/sign-in?next=%2Fanalysis",
    recentImportAccountHref: "/account",
    recentImportFetchedAt: 0,
    recentImportPromise: null,
    recentArcadeImportState: "idle",
    recentArcadeImportGames: [],
    recentArcadeImportMessage: "",
    recentArcadeImportFetchedAt: 0,
    recentArcadeImportPromise: null,
    randomGameOfTheDayState: "idle",
    randomGameOfTheDayGame: null,
    randomGameOfTheDayFetchedAt: 0,
    randomGameOfTheDayPromise: null,
    importPlaybackNodeIds: [],
    importPlaybackIndex: 0,
    importPlaybackTimer: null,
  };

  const ui = {};

  loadSettings();
  renderShell();
  revealAppWhenReady();
  bindStaticEvents();
  initialise();

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE.settings);
      if (raw) {
        const parsed = JSON.parse(raw);
        state.orientation = parsed.orientation === "black" ? "black" : "white";
        if (!INITIAL_ANALYZE_PREFERENCES) {
          applyAnalyzePreferences({
            limitKind: parsed.limitKind,
            timeLimitValue:
              parsed.timeLimitValue ??
              (parsed.limitKind === "time" ? parsed.limitValue : undefined),
            depthLimitValue:
              parsed.depthLimitValue ??
              (parsed.limitKind === "depth" ? parsed.limitValue : undefined),
            linesShown: parsed.linesShown,
            threads: parsed.threads,
            boardTheme: parsed.boardTheme,
            pieceTheme: parsed.pieceTheme,
          });
        }
      }
    } catch (error) {
      console.warn("Could not load settings", error);
    }
    if (INITIAL_ANALYZE_PREFERENCES) {
      applyAnalyzePreferences(INITIAL_ANALYZE_PREFERENCES);
    }
    const storedProviderRaw = localStorage.getItem(STORAGE.provider) || "";
    const storedProvider =
      storedProviderRaw === "minimax" ? "openai" : storedProviderRaw;
    const preferredProvider = isValidCoachProvider(storedProvider)
      ? storedProvider
      : defaultCoachProvider();
    state.llmProvider = preferredProvider;
    state.llmApiKey =
      localStorage.getItem(localApiKeyStorageKey(state.llmProvider)) || "";
    const storedModel =
      localStorage.getItem(localModelStorageKey(state.llmProvider)) || "";
    if (storedModel) {
      state.llmModel = storedModel;
    } else if (INITIAL_COACH_SETTINGS) {
      state.llmModel =
        savedCoachModelForProvider(state.llmProvider) ||
        defaultCoachModelForProvider(state.llmProvider);
    } else {
      state.llmModel = defaultCoachModelForProvider(state.llmProvider);
    }
  }

  function saveSettings() {
    localStorage.setItem(
      STORAGE.settings,
      JSON.stringify({
        limitKind: state.limitKind,
        limitValue: state.limitValue,
        timeLimitValue: state.timeLimitValue,
        depthLimitValue: state.depthLimitValue,
        linesShown: state.linesShown,
        threads: state.threads,
        boardTheme: state.boardTheme,
        pieceTheme: state.pieceTheme,
        orientation: state.orientation,
      }),
    );
    queuePersistAnalyzePreferences();
  }

  function sanitizePersistedChatMessage(rawMessage) {
    if (!rawMessage || typeof rawMessage !== "object") return null;
    const role = String(rawMessage.role || "").trim();
    if (!role) return null;
    return {
      role,
      content: String(rawMessage.content || ""),
      extraClass: rawMessage.extraClass
        ? String(rawMessage.extraClass)
        : undefined,
    };
  }

  function restorePersistedChatState(chatState) {
    if (!chatState || typeof chatState !== "object") return;
    const restoredMessages = Array.isArray(chatState.messages)
      ? chatState.messages
          .map(sanitizePersistedChatMessage)
          .filter(Boolean)
          .slice(-20)
      : [];
    state.llmMessages = restoredMessages;
    state.llmConversation = trimConversationMessages(
      Array.isArray(chatState.conversation) ? chatState.conversation : [],
    );
    state.llmLastContextFen = String(chatState.lastContextFen || "");
    state.llmLastContextTrail = String(chatState.lastContextTrail || "");
    state.llmTurnCount = Math.max(0, Number(chatState.turnCount) || 0);
    state.llmContextSentTurn = Math.max(
      0,
      Number(chatState.contextSentTurn) || 0,
    );
    const explained = Array.isArray(chatState.explainedFens)
      ? chatState.explainedFens.map((fen) => String(fen || "")).filter(Boolean)
      : [];
    state.llmExplainedFens = new Set(explained);
  }

  function buildPersistedBoardStatePayload() {
    if (!state.root || !state.current) return null;
    const queue = [state.root];
    const seen = new Set();
    const nodes = [];
    while (queue.length) {
      const node = queue.shift();
      if (!node || !node.id || seen.has(node.id)) continue;
      seen.add(node.id);
      const children = Array.isArray(node.children) ? node.children : [];
      nodes.push({
        id: String(node.id),
        fen: String(node.fen || ""),
        label: String(node.label || ""),
        san: String(node.san || ""),
        uci: String(node.uci || ""),
        isCapture: node.isCapture === true,
        moveClassKey: String(node.moveClassKey || ""),
        parentId: node.parent?.id ? String(node.parent.id) : null,
        childIds: children.map((child) => String(child?.id || "")).filter(Boolean),
        preferredChildId: node.preferredChildId ? String(node.preferredChildId) : null,
        mainlineChildId: node.mainlineChildId ? String(node.mainlineChildId) : null,
      });
      children.forEach((child) => {
        if (child?.id && !seen.has(child.id)) queue.push(child);
      });
    }
    if (!nodes.length) return null;
    const playerClocks = Array.from(state.playerClockByNodeId.entries())
      .map(([nodeId, snapshot]) => ({
        nodeId: String(nodeId || ""),
        white: normalizeClockDisplay(snapshot?.white),
        black: normalizeClockDisplay(snapshot?.black),
      }))
      .filter((entry) => entry.nodeId && (entry.white || entry.black));
    return {
      version: BOARD_STATE_VERSION,
      savedAt: Date.now(),
      nodeCounter: Number(nodeCounter) || 0,
      rootId: String(state.root.id || ""),
      currentId: String(state.current.id || ""),
      currentFen: String(state.current.fen || ""),
      workspaceMode: state.workspaceMode,
      orientation: state.orientation,
      nodes,
      arcade: {
        variantKey: state.arcadeVariantKey,
        hiddenElo: Number(state.arcadeHiddenElo) || 1500,
        targetElo: Number(state.arcadeTargetElo) || 1500,
        burstPliesLeft: Number(state.arcadeBurstPliesLeft) || 0,
        weirdhorseProfilesByCycle: Array.from(
          state.weirdhorseProfilesByCycle.entries(),
        ),
      },
      players: {
        whiteName: state.whitePlayerName,
        blackName: state.blackPlayerName,
        whiteRating: state.whitePlayerRating,
        blackRating: state.blackPlayerRating,
        importedWhiteName: state.importedWhitePlayerName,
        importedBlackName: state.importedBlackPlayerName,
        importedWhiteRating: state.importedWhitePlayerRating,
        importedBlackRating: state.importedBlackPlayerRating,
      },
      playerClocks,
      chat: {
        messages: state.llmMessages.slice(-20),
        conversation: trimConversationMessages(state.llmConversation),
        lastContextFen: state.llmLastContextFen,
        lastContextTrail: state.llmLastContextTrail,
        turnCount: state.llmTurnCount,
        contextSentTurn: state.llmContextSentTurn,
        explainedFens: Array.from(state.llmExplainedFens || []),
      },
    };
  }

  function persistArcadeGameState(options = {}) {
    const persistUrl = getArcadeGamePersistUrl();
    if (!persistUrl) return;
    try {
      const payload = buildPersistedBoardStatePayload();
      if (!payload) return;
      const persistKey = JSON.stringify({
        ...payload,
        savedAt: 0,
      });
      if (!options.force && persistKey === _arcadeGamePersistKey) return;
      _arcadeGamePersistKey = persistKey;
      const body = JSON.stringify({ state: payload });
      if (options.keepalive && navigator?.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon(persistUrl, blob)) return;
      }
      fetch(persistUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body,
        keepalive: options.keepalive === true,
      }).catch(() => {});
    } catch (error) {
      console.warn("Could not persist arcade game state", error);
    }
  }

  function persistBoardState() {
    if (_boardStatePersistTimer) {
      clearTimeout(_boardStatePersistTimer);
      _boardStatePersistTimer = null;
    }
    try {
      const payload = buildPersistedBoardStatePayload();
      if (!payload) return;
      localStorage.setItem(STORAGE.boardState, JSON.stringify(payload));
    } catch (error) {
      console.warn("Could not persist board state", error);
    }
  }

  function schedulePersistedBoardStateSave(delay = 150) {
    if (_boardStatePersistTimer) clearTimeout(_boardStatePersistTimer);
    _boardStatePersistTimer = setTimeout(() => {
      _boardStatePersistTimer = null;
      persistBoardState();
      persistArcadeGameState();
    }, delay);
  }

  function flushPersistedBoardState() {
    if (_boardStatePersistTimer) {
      clearTimeout(_boardStatePersistTimer);
      _boardStatePersistTimer = null;
    }
    persistBoardState();
    persistArcadeGameState({ keepalive: true, force: true });
  }

  function restoreBoardStatePayload(parsed, options = {}) {
    try {
      if (!parsed || parsed.version !== BOARD_STATE_VERSION) return false;

      if (options.restoreChat !== false && parsed.chat) {
        restorePersistedChatState(parsed.chat);
      }

      const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
      if (!rawNodes.length) return false;
      const rawById = new Map();
      const restoredById = new Map();
      for (const rawNode of rawNodes) {
        const id = String(rawNode?.id || "").trim();
        if (!id || restoredById.has(id)) continue;
        let fen = START_FEN;
        try {
          fen = normalizeFen(String(rawNode?.fen || START_FEN));
        } catch (_) {
          continue;
        }
        rawById.set(id, rawNode);
        restoredById.set(id, {
          id,
          fen,
          label: String(rawNode?.label || ""),
          san: String(rawNode?.san || ""),
          uci: String(rawNode?.uci || ""),
          isCapture: rawNode?.isCapture === true,
          moveClassKey: String(rawNode?.moveClassKey || ""),
          parent: null,
          children: [],
          preferredChildId: rawNode?.preferredChildId
            ? String(rawNode.preferredChildId)
            : null,
          mainlineChildId: rawNode?.mainlineChildId
            ? String(rawNode.mainlineChildId)
            : null,
        });
      }
      if (!restoredById.size) return false;

      for (const [id, node] of restoredById.entries()) {
        const rawNode = rawById.get(id) || {};
        const childIds = Array.isArray(rawNode.childIds) ? rawNode.childIds : [];
        const children = [];
        childIds.forEach((childIdRaw) => {
          const childId = String(childIdRaw || "");
          const child = restoredById.get(childId);
          if (!child || children.includes(child)) return;
          children.push(child);
          child.parent = node;
        });
        node.children = children;
      }

      const rootId = String(parsed.rootId || "");
      const currentId = String(parsed.currentId || "");
      const root =
        restoredById.get(rootId) ||
        Array.from(restoredById.values()).find((node) => !node.parent) ||
        null;
      if (!root) return false;

      const reachableById = new Map();
      const stack = [root];
      while (stack.length) {
        const node = stack.pop();
        if (!node || reachableById.has(node.id)) continue;
        reachableById.set(node.id, node);
        node.children = node.children.filter((child) => !!child);
        node.children.forEach((child) => {
          child.parent = node;
          stack.push(child);
        });
      }
      if (!reachableById.size) return false;

      root.parent = null;
      nodeRegistry.clear();
      reachableById.forEach((node) => nodeRegistry.set(node.id, node));
      state.root = root;
      state.current = reachableById.get(currentId) || root;

      let maxIdCounter = 0;
      reachableById.forEach((node) => {
        const match = /^node-(\d+)$/.exec(String(node.id || ""));
        if (!match) return;
        const value = Number(match[1]) || 0;
        if (value > maxIdCounter) maxIdCounter = value;
      });
      const savedCounter = Number(parsed.nodeCounter) || 0;
      nodeCounter = Math.max(nodeCounter, maxIdCounter, savedCounter);

      state.workspaceMode =
        typeof parsed.workspaceMode === "string"
          ? normalizeWorkspaceMode(parsed.workspaceMode)
          : state.workspaceMode;
      state.orientation = parsed.orientation === "black" ? "black" : "white";

      const arcade =
        parsed.arcade && typeof parsed.arcade === "object" ? parsed.arcade : {};
      const restoredVariantKey = String(
        arcade.variantKey || getInitialArcadeVariantKey() || state.arcadeVariantKey,
      )
        .trim()
        .toLowerCase();
      if (ARCADE_VARIANTS[restoredVariantKey]) {
        state.arcadeVariantKey = restoredVariantKey;
      }
      state.arcadeHiddenElo = Math.max(
        100,
        Number(arcade.hiddenElo) || state.arcadeHiddenElo || 1500,
      );
      state.arcadeTargetElo = Math.max(
        100,
        Number(arcade.targetElo) || state.arcadeTargetElo || state.arcadeHiddenElo,
      );
      state.arcadeBurstPliesLeft = Math.max(
        0,
        Number(arcade.burstPliesLeft) || 0,
      );
      const restoredWeirdhorseProfiles = new Map();
      const rawProfileEntries = Array.isArray(arcade.weirdhorseProfilesByCycle)
        ? arcade.weirdhorseProfilesByCycle
        : [];
      rawProfileEntries.forEach((entry) => {
        if (!Array.isArray(entry) || entry.length < 2) return;
        const cycleKey = String(entry[0] || "").trim();
        const profile = entry[1];
        if (
          !cycleKey ||
          !profile ||
          typeof profile !== "object" ||
          Array.isArray(profile)
        ) {
          return;
        }
        const normalizedProfile = {
          key: String(profile.key || cycleKey),
          label: String(profile.label || "Horse Law"),
          mode: String(profile.mode || ""),
          offsets: Array.isArray(profile.offsets)
            ? profile.offsets
                .map((offset) => ({
                  dx: Number(offset?.dx) || 0,
                  dy: Number(offset?.dy) || 0,
                }))
                .filter((offset) => offset.dx || offset.dy)
            : [],
        };
        if (!normalizedProfile.offsets.length) return;
        restoredWeirdhorseProfiles.set(cycleKey, normalizedProfile);
      });
      state.weirdhorseProfilesByCycle = restoredWeirdhorseProfiles;

      const players =
        parsed.players && typeof parsed.players === "object" ? parsed.players : {};
      setPlayerNames(
        String(players.whiteName || "White"),
        String(players.blackName || "Black"),
      );
      setPlayerRatings(
        String(players.whiteRating || ""),
        String(players.blackRating || ""),
      );
      setImportedPlayerIdentity(
        String(players.importedWhiteName || players.whiteName || ""),
        String(players.importedBlackName || players.blackName || ""),
        String(players.importedWhiteRating || players.whiteRating || ""),
        String(players.importedBlackRating || players.blackRating || ""),
      );

      const restoredClockMap = new Map();
      const rawPlayerClocks = Array.isArray(parsed.playerClocks)
        ? parsed.playerClocks
        : [];
      rawPlayerClocks.forEach((entry) => {
        const nodeId = String(entry?.nodeId || "").trim();
        if (!nodeId || !reachableById.has(nodeId)) return;
        const white = normalizeClockDisplay(entry?.white);
        const black = normalizeClockDisplay(entry?.black);
        if (!white && !black) return;
        restoredClockMap.set(nodeId, { white, black });
      });
      state.playerClockByNodeId = restoredClockMap;
      return true;
    } catch (error) {
      console.warn("Could not restore persisted board state", error);
      return false;
    }
  }

  function restorePersistedBoardAndChatState() {
    try {
      const raw = localStorage.getItem(STORAGE.boardState);
      if (!raw) return false;
      return restoreBoardStatePayload(JSON.parse(raw));
    } catch (error) {
      console.warn("Could not restore persisted board state", error);
      return false;
    }
  }

  function applyAnalyzePreferences(preferences) {
    if (!preferences || typeof preferences !== "object") return;
    state.limitKind = preferences.limitKind === "depth" ? "depth" : "time";
    state.timeLimitValue = clampInt(
      preferences.timeLimitValue,
      1,
      1000000,
      state.timeLimitValue,
    );
    state.depthLimitValue = clampInt(
      preferences.depthLimitValue,
      1,
      245,
      state.depthLimitValue,
    );
    state.linesShown = clampInt(
      preferences.linesShown,
      1,
      10,
      state.linesShown,
    );
    state.threads = clampInt(
      preferences.threads,
      1,
      MAX_ENGINE_THREADS,
      state.threads,
    );
    state.boardTheme = BOARD_THEMES[preferences.boardTheme]
      ? preferences.boardTheme
      : state.boardTheme;
    state.pieceTheme = PIECE_THEMES[preferences.pieceTheme]
      ? preferences.pieceTheme
      : state.pieceTheme;
    state.coachEnabled = false;
    state.limitValue =
      state.limitKind === "depth"
        ? state.depthLimitValue
        : state.timeLimitValue;
    // Sync the auto-coach button UI
    if (ui.autoCoachBtn) {
      ui.autoCoachBtn.textContent = "Auto: Off";
      ui.autoCoachBtn.classList.remove("active");
      ui.autoCoachBtn.hidden = true;
      ui.autoCoachBtn.disabled = true;
    }
  }

  function currentAnalyzePreferencesPayload() {
    return {
      limitKind: state.limitKind,
      timeLimitValue: state.timeLimitValue,
      depthLimitValue: state.depthLimitValue,
      linesShown: state.linesShown,
      threads: state.threads,
      boardTheme: state.boardTheme,
      pieceTheme: state.pieceTheme,
      coachEnabled: state.coachEnabled,
    };
  }

  function queuePersistAnalyzePreferences() {
    const persistUrl = getAnalyzePreferencesPersistUrl();
    if (!persistUrl) return;
    if (_analyzePreferencesPersistTimer)
      clearTimeout(_analyzePreferencesPersistTimer);
    _analyzePreferencesPersistTimer = setTimeout(() => {
      _analyzePreferencesPersistTimer = null;
      const nextPersistUrl = getAnalyzePreferencesPersistUrl();
      if (!nextPersistUrl) return;
      fetch(nextPersistUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(currentAnalyzePreferencesPayload()),
      }).catch(() => {});
    }, 250);
  }

  function renderShell() {
    root.innerHTML = `
      <div class="shell">
        <header id="topbar" class="glass topbar">
          ${EMBEDDED_MODE ? "" : `<div id="brandBlock" class="brand">
            <h1>${APP_NAME}</h1>
          </div>`}
          <div class="topbar-center">
            <div id="openingTrail" class="topbar-opening"></div>
            <div id="historyTrail" class="trail-list"></div>
          </div>
          ${EMBEDDED_MODE ? "" : `<div id="statusBlock" class="status">
            <div id="engineHint" class="status-hint"></div>
          </div>`}
        </header>
        <main class="workspace">
          <section class="left">
            <section class="board-pane">
              <div class="board-stage">
                <aside class="glass board-history-panel">
                  <div class="board-history-opening">
                    <div id="openingPanelTitle" class="board-history-opening-title"></div>
                  </div>
                  <div class="board-history-head">
                    <h2>Moves</h2>
                  </div>
                  <div id="movePanelList" class="board-history-list"></div>
                </aside>
                <div class="board-stack">
                  <div class="board-frame">
                    <div id="evalBar" class="eval-bar">
                      <div class="eval-bar-line"></div>
                      <div id="evalBarFill" class="eval-bar-fill"></div>
                    </div>
                    <div class="board-shell-wrap">
                      <div id="topPlayerInfo" class="board-player-info top"></div>
                      <div id="boardShell" class="board-shell">
                        <div id="boardGrid" class="board-grid"></div>
                        <svg id="annotationSvg" class="annotation-svg" viewBox="0 0 800 800" preserveAspectRatio="none"></svg>
                        <svg id="overlaySvg" class="overlay-svg" viewBox="0 0 800 800" preserveAspectRatio="none"></svg>
                        <svg id="overlayGhostSvg" class="overlay-ghost-svg" viewBox="0 0 800 800" preserveAspectRatio="none"></svg>
                        <div id="piecesLayer" class="piece-layer"></div>
                        <svg id="overlayNodeSvg" class="overlay-node-svg" viewBox="0 0 800 800" preserveAspectRatio="none"></svg>
                        <svg id="overlayGhostNodeSvg" class="overlay-ghost-node-svg" viewBox="0 0 800 800" preserveAspectRatio="none"></svg>
                        <svg id="overlayHit" class="overlay-hit" viewBox="0 0 800 800" preserveAspectRatio="none"></svg>
                        <div id="legalLayer" class="legal-layer"></div>
                        <div id="dragLayer" class="drag-layer"></div>
                      </div>
                      <div id="bottomPlayerInfo" class="board-player-info bottom"></div>
                    </div>
                  </div>
                  <section class="glass board-options">
                    <div class="options-toolbar">
                      <div class="options-actions">
                        <div class="options-primary-actions">
                          <button class="btn" id="resetBtn">Reset Board</button>
                          <button class="btn" id="flipBtn">Flip Board</button>
                          <button class="btn" id="haltBtn">Hide lines</button>
                          <button class="btn" id="settingsBtn" type="button">Analysis settings</button>
                        </div>
                      </div>
                      <div class="toolbar-io-actions">
                        <button class="btn primary" id="importBtn" type="button">Import Game</button>
                        <button class="btn" id="exportBtn">Export PGN/FEN</button>
                      </div>
                    </div>
                  </section>
                </div>
            <section class="board-analysis">
                  <div class="board-analysis-head">
                    <div class="board-analysis-head-main">
                      <h2>Analysis</h2>
                      <span id="evalBarValue" class="eval-bar-value">0.0</span>
                    </div>
                    <span id="analysisMeta"></span>
                  </div>
                  <div class="board-analysis-sections">
                    <section class="board-analysis-primary">
                      <div id="analysisList" class="analysis-list board-analysis-list"></div>
                    </section>
                    <section class="theme-analysis">
                      <div class="theme-analysis-head">
                        <div class="theme-analysis-head-main">
                          <h2>Tactical Signals</h2>
                        </div>
                        <span id="themeAnalysisMeta">Waiting for position</span>
                      </div>
                      <div id="themeAnalysisList" class="theme-analysis-badges">
                        <span class="theme-analysis-empty">No active tactical signals.</span>
                      </div>
                    </section>
                  </div>
                </section>
              </div>
            </section>
          </section>
          <aside class="right">
            <section class="glass card report-card" id="coachCard">
              <div class="head"><h2>Game Report</h2><span id="evalChartMeta"></span></div>
              <div class="report-stack">
                <div id="reportOverview" class="report-overview"></div>
                <div id="assistantMessages" class="assistant-messages report-breakdown"></div>
                <div class="eval-wrap report-eval-wrap">
                  <svg id="evalChart" class="eval-chart" viewBox="0 0 640 220" preserveAspectRatio="none"></svg>
                  <div id="evalTooltip" class="eval-tooltip"></div>
                </div>
              </div>
              <div class="chat" hidden aria-hidden="true">
                <div class="pill" id="coachPill" hidden aria-hidden="true"><span></span><input id="assistantInput" type="text" hidden disabled aria-hidden="true"><button class="btn send" id="sendBtn" hidden disabled aria-hidden="true">Send</button></div>
                <div class="coach-hidden-settings" hidden aria-hidden="true">
                  <input id="apiKeyInput" class="input" type="password" placeholder="Provider API key">
                  <input id="modelInput" class="input" type="text">
                  <button class="btn" id="saveAssistantBtn" type="button">Save settings</button>
                </div>
              </div>
            </section>
          </aside>
        </main>
      </div>
      <div id="importModal" class="import-modal" aria-hidden="true">
        <div class="import-backdrop" data-close-import="true"></div>
        <div class="glass import-panel" role="dialog" aria-modal="true" aria-labelledby="importTitle">
          <div class="import-head">
            <h3 id="importTitle">Import PGN / FEN</h3>
            <button class="btn subtle" id="closeImportBtn" type="button">Close</button>
          </div>
          <div class="import-body import-body-split">
            <section class="import-manual-section">
              <div class="import-section-head">
                <h4>Import from FEN / PGN</h4>
              </div>
              <textarea id="importInput" class="textarea import-paste mono" placeholder="Paste a full PGN or a FEN string" spellcheck="false"></textarea>
              <div class="import-actions">
                <button class="btn primary" id="submitImportBtn" type="button">Import Game</button>
              </div>
            </section>
            <section class="import-recent-section">
              <div class="import-section-head">
                <h4>Import from recent games</h4>
              </div>
              <div id="importRecentList" class="import-recent-list"></div>
            </section>
            <section class="import-recent-section">
              <div class="import-section-head">
                <h4>Recent arcade games</h4>
              </div>
              <div id="importArcadeList" class="import-recent-list"></div>
            </section>
            <section class="import-recent-section">
              <div class="import-section-head">
                <h4>Random game of the day</h4>
              </div>
              <div id="importRandomGameList" class="import-recent-list"></div>
            </section>
          </div>
        </div>
      </div>
      <div id="exportModal" class="export-modal" aria-hidden="true">
        <div class="export-backdrop" data-close-export="true"></div>
        <div class="glass export-panel" role="dialog" aria-modal="true" aria-labelledby="exportTitle">
          <div class="export-head">
            <h3 id="exportTitle">Export PGN / FEN</h3>
            <button class="btn subtle" id="closeExportBtn">Close</button>
          </div>
          <div class="export-body">
            <div class="field">
              <label for="exportFenOutput">FEN</label>
              <div class="export-row">
                <input id="exportFenOutput" class="export-output export-fen mono" type="text" readonly>
                <button class="btn copy-btn" id="copyFenBtn" type="button" title="Copy FEN" aria-label="Copy FEN">${COPY_ICON_SVG}</button>
              </div>
            </div>
            <div class="field">
              <label for="exportPgnOutput">PGN</label>
              <div class="export-row">
                <textarea id="exportPgnOutput" class="export-output export-pgn mono" readonly></textarea>
                <button class="btn copy-btn" id="copyPgnBtn" type="button" title="Copy PGN" aria-label="Copy PGN">${COPY_ICON_SVG}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div id="settingsModal" class="settings-modal" aria-hidden="true">
        <div class="settings-backdrop" data-close-settings="true"></div>
        <div class="glass settings-panel" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
          <div class="settings-head">
            <h3 id="settingsTitle">Analysis settings</h3>
            <button class="btn subtle" id="closeSettingsBtn" type="button">Close</button>
          </div>
          <div class="settings-body">
            <section class="settings-section">
              <div class="settings-section-head">
                <strong>Search</strong>
              </div>
              <div class="row two">
                <label class="field">
                  <span>Search Mode</span>
                  <select id="limitKind" class="select">
                    <option value="time">Time</option>
                    <option value="depth">Depth</option>
                  </select>
                </label>
                <label class="field">
                  <span id="limitValueLabel">Time (ms)</span>
                  <input id="limitValue" class="input mono" type="number" min="1" step="1">
                </label>
              </div>
              <div class="row two">
                <label class="field">
                  <span>Multi PV</span>
                  <select id="linesShown" class="select">
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                    <option value="6">6</option>
                    <option value="7">7</option>
                    <option value="8">8</option>
                    <option value="9">9</option>
                    <option value="10">10</option>
                  </select>
                </label>
                <label class="field">
                  <span>Threads</span>
                  <input id="threadsValue" class="input mono" type="number" min="1" step="1">
                </label>
              </div>
            </section>
          </div>
        </div>
      </div>
      <div id="globalLoader" class="global-loader" aria-hidden="true">
        <div class="global-loader-backdrop"></div>
        <div class="glass global-loader-panel">
          <div class="global-spinner" aria-hidden="true"></div>
        </div>
      </div>
    `;

    [
      "topbar",
      "brandBlock",
      "statusBlock",
      "engineHint",
      "openingTrail",
      "historyTrail",
      "openingPanelTitle",
      "movePanelMeta",
      "movePanelList",
      "boardShell",
      "topPlayerInfo",
      "bottomPlayerInfo",
      "boardGrid",
      "evalBar",
      "evalBarFill",
      "evalBarValue",
      "annotationSvg",
      "piecesLayer",
      "overlaySvg",
      "overlayGhostSvg",
      "overlayNodeSvg",
      "overlayGhostNodeSvg",
      "overlayHit",
      "legalLayer",
      "dragLayer",
      "analysisList",
      "analysisMeta",
      "themeAnalysisMeta",
      "themeAnalysisList",
      "settingsBtn",
      "resetBtn",
      "flipBtn",
      "importInput",
      "importBtn",
      "importModal",
      "closeImportBtn",
      "submitImportBtn",
      "importRecentList",
      "importArcadeList",
      "importRandomGameList",
      "exportBtn",
      "exportModal",
      "closeExportBtn",
      "settingsModal",
      "closeSettingsBtn",
      "limitKind",
      "limitValueLabel",
      "limitValue",
      "linesShown",
      "threadsValue",
      "exportFenOutput",
      "exportPgnOutput",
      "copyFenBtn",
      "copyPgnBtn",
      "globalLoader",
      "evalChart",
      "evalChartMeta",
      "evalTooltip",
      "reportOverview",
      "assistantMessages",
      "assistantInput",
      "apiKeyInput",
      "modelInput",
      "haltBtn",
      "sendBtn",
      "saveAssistantBtn",
      "clearChatBtn",
      "coachCard",
      "coachPill",
      "coachReviewCta",
      "coachGoToReviewBtn",
      "autoCoachBtn",
    ].forEach((id) => {
      ui[id] = document.getElementById(id);
    });

    ui.apiKeyInput.value = state.llmApiKey;
    ui.modelInput.value = state.llmModel;
    syncSearchSettingsControls();
    renderThemeSettings();
    scheduleTopbarLayoutSync();
  }

  function bindStaticEvents() {
    ui.resetBtn.addEventListener("click", newGame);
    ui.flipBtn.addEventListener("click", flipBoard);
    ui.haltBtn.addEventListener("click", toggleEngineLines);
    ui.settingsBtn.addEventListener("click", openSettingsModal);
    ui.analysisList.addEventListener("click", (event) => {
      const row = event.target.closest(".analysis-row");
      if (!row) return;
      applyPrincipalMove(row.dataset.uci);
    });
    ui.analysisList.addEventListener("mouseover", (event) => {
      const row = event.target.closest(".analysis-row");
      if (!row || !ui.analysisList.contains(row)) return;
      const from =
        event.relatedTarget instanceof Element
          ? event.relatedTarget.closest(".analysis-row")
          : null;
      if (from === row) return;
      if (row.dataset.uci !== state.hoveredUci) {
        state.hoveredUci = row.dataset.uci;
        renderAnalysisHoverOnly();
        scheduleOverlayHoverRender();
        schedulePatternDetection();
      }
    });
    ui.analysisList.addEventListener("mouseout", (event) => {
      const row = event.target.closest(".analysis-row");
      if (!row || !ui.analysisList.contains(row)) return;
      const to =
        event.relatedTarget instanceof Element
          ? event.relatedTarget.closest(".analysis-row")
          : null;
      if (to === row) return;
      if (state.hoveredUci === row.dataset.uci) {
        state.hoveredUci = null;
        renderAnalysisHoverOnly();
        scheduleOverlayHoverRender();
        schedulePatternDetection();
      }
    });
    ui.analysisList.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const row = event.target.closest(".analysis-row");
      if (!row) return;
      event.preventDefault();
      applyPrincipalMove(row.dataset.uci);
    });
    ui.historyTrail.addEventListener("click", (event) => {
      const target = event.target.closest("[data-node-id]");
      if (!target) return;
      const node = nodeRegistry.get(target.dataset.nodeId) || null;
      if (node) goToNode(node);
    });
    ui.movePanelList.addEventListener("click", (event) => {
      const target = event.target.closest("[data-node-id]");
      if (!target) return;
      const node = nodeRegistry.get(target.dataset.nodeId) || null;
      if (node) goToNode(node);
    });
    ui.movePanelList.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target.closest("[data-node-id]");
      if (!target) return;
      event.preventDefault();
      const node = nodeRegistry.get(target.dataset.nodeId) || null;
      if (node) goToNode(node);
    });
    ui.assistantMessages.addEventListener("click", (event) => {
      const variantButton = event.target.closest("[data-arcade-variant]");
      if (variantButton) {
        event.preventDefault();
        setArcadeVariant(variantButton.dataset.arcadeVariant || "");
        return;
      }
      const reportJump = event.target.closest("[data-report-node-id]");
      if (!reportJump) return;
      event.preventDefault();
      const node = nodeRegistry.get(reportJump.dataset.reportNodeId) || null;
      if (node) goToNode(node);
    });
    ui.importRecentList.addEventListener("click", (event) => {
      const refreshButton = event.target.closest("[data-recent-refresh]");
      if (refreshButton) {
        event.preventDefault();
        ensureRecentImportGames(true);
        return;
      }
      const target = event.target.closest("[data-recent-game-id]");
      if (!target) return;
      event.preventDefault();
      importRecentGame(target.dataset.recentGameId || "");
    });
    ui.importArcadeList.addEventListener("click", (event) => {
      const refreshButton = event.target.closest("[data-arcade-refresh]");
      if (refreshButton) {
        event.preventDefault();
        ensureRecentArcadeImportGames(true);
        return;
      }
      const target = event.target.closest("[data-arcade-import-id]");
      if (!target) return;
      event.preventDefault();
      importRecentArcadeGame(target.dataset.arcadeImportId || "");
    });
    ui.importRandomGameList.addEventListener("click", (event) => {
      const refreshButton = event.target.closest("[data-random-game-refresh]");
      if (refreshButton) {
        event.preventDefault();
        ensureRandomGameOfTheDay(true);
        return;
      }
      const target = event.target.closest("[data-random-game-gid]");
      if (!target) return;
      event.preventDefault();
      importRandomGameOfTheDay();
    });
    ui.evalChart.addEventListener("mouseover", (event) => {
      const target = event.target.closest("[data-node-id]");
      if (!target) return;
      showEvalTooltip(target, event);
    });
    ui.evalChart.addEventListener("mousemove", (event) => {
      const target = event.target.closest("[data-node-id]");
      if (!target) {
        hideEvalTooltip();
        return;
      }
      showEvalTooltip(target, event);
    });
    ui.evalChart.addEventListener("mouseleave", hideEvalTooltip);
    ui.evalChart.addEventListener("click", (event) => {
      const target = event.target.closest("[data-node-id]");
      if (!target) return;
      const node = nodeRegistry.get(target.dataset.nodeId) || null;
      if (node) goToNode(node);
    });
    if (ui.coachGoToReviewBtn) {
      ui.coachGoToReviewBtn.addEventListener("click", (event) => {
        event.preventDefault();
        navigateToReviewForCurrentGame();
      });
    }
    ui.importBtn.addEventListener("click", openImportModal);
    ui.closeImportBtn.addEventListener("click", closeImportModal);
    ui.submitImportBtn.addEventListener("click", submitImportModal);
    ui.importModal.addEventListener("click", (event) => {
      if (event.target?.dataset?.closeImport === "true") closeImportModal();
    });
    ui.importInput.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        submitImportModal();
      }
    });
    ui.exportBtn.addEventListener("click", openExportModal);
    ui.closeExportBtn.addEventListener("click", closeExportModal);
    ui.exportModal.addEventListener("click", (event) => {
      if (event.target?.dataset?.closeExport === "true") closeExportModal();
    });
    ui.closeSettingsBtn.addEventListener("click", closeSettingsModal);
    ui.settingsModal.addEventListener("click", (event) => {
      if (event.target?.dataset?.closeSettings === "true") closeSettingsModal();
    });
    ui.limitKind.addEventListener("change", onSearchSettingChange);
    ui.limitValue.addEventListener("change", onSearchSettingChange);
    ui.linesShown.addEventListener("change", onSearchSettingChange);
    ui.threadsValue.addEventListener("change", onSearchSettingChange);
    ui.copyFenBtn.addEventListener("click", async () =>
      copyExportField(ui.exportFenOutput, "FEN copied"),
    );
    ui.copyPgnBtn.addEventListener("click", async () =>
      copyExportField(ui.exportPgnOutput, "PGN copied"),
    );
    ui.sendBtn.addEventListener("click", sendQuestion);
    ui.assistantInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        sendQuestion();
      }
    });
    ui.saveAssistantBtn.addEventListener("click", saveAssistantSettings);
    ui.clearChatBtn?.addEventListener("click", clearChat);
    ui.autoCoachBtn?.addEventListener("click", (event) => {
      event.preventDefault();
    });
    document.addEventListener("pointerdown", onGlobalPointerDown, true);
    window.addEventListener("keydown", onGlobalKeyDown);
    window.addEventListener("resize", scheduleTopbarLayoutSync);
    if (document.fonts?.ready) {
      document.fonts.ready.then(scheduleTopbarLayoutSync).catch(() => {});
    }
  }

  function onGlobalPointerDown(event) {
    resumeAudioContext();
    primeSoundBank();
  }

  function initialise() {
    logInit("initialise:start");
    document.addEventListener("pointerdown", () => resumeAudioContext(), {
      once: true,
      capture: true,
    });
    createEngine();
    primeSoundBank();
    primeOpeningBook();
    const restoredBoard = INITIAL_ARCADE_GAME?.state
      ? restoreBoardStatePayload(INITIAL_ARCADE_GAME.state)
      : getArcadeGamePersistUrl()
        ? false
        : restorePersistedBoardAndChatState();
    if (!restoredBoard) {
      state.root = makeRoot(START_FEN, "Start position");
      state.current = state.root;
    }
    invalidateGameCache();
    invalidateLegalUciSetCache();
    invalidateHistoryRenderCache();
    invalidateEvalChartRenderCache();
    resetAnalysisCaches();
    loadPersistedAnalysisCaches();
    refreshPieceAnalysisCache();
    const restored = restoreBestCachedAnalysisForCurrentPosition();
    if (restored) holdCachedAnalysisResult();
    refreshOpeningData();
    renderAll();
    applyInitialWorkspaceMode();
    if (!restoredBoard && isArcadeMode()) {
      newGame();
    }
    window.__chessSomething = {
      getEngineRaw: () => state.engineRaw.slice(),
      _renderCount: 0,
      // Debug interface for CDP probing:
      state,
      classificationForHistoryNode,
      fullPositionRowsForFen,
      analysisRowsForFen,
      classificationForFenAndUci,
      brilliantDiagnosticsForFenAndUci,
      classifyAnalysisMove,
      displayedMoveClassForUci,
      moveDangerProfile,
      looksCritical,
      readOnlyGameForFen,
      evalChartMoveClass,
      classifyLossMove,
      currentGame,
      analysisVersionForFen,
      tacticalSignalsForCurrentLine,
      positionAnalysisCache: state.positionAnalysisCache,
      playedMoveAnalysisCache: state.playedMoveAnalysisCache,
      currentFen: () => state.current?.fen,
      currentUci: () => state.current?.uci,
      parentFen: () => state.current?.parent?.fen,
      parentUci: () => state.current?.parent?.uci,
      // Debug persistence:
      flushPersistedAnalysisCaches,
      persistAnalysisCaches: (force) => persistAnalysisCaches(force),
      buildPersistedAnalysisCachePayload,
      setWorkspaceMode: (mode) => setWorkspaceMode(mode),
      applyUserAnalyzePreferences: (preferences) => {
        applyAnalyzePreferences(preferences);
        saveSettings();
        syncSearchSettingsControls();
        state.analysisRows = Array.from(state.analysisMap.values())
          .sort((a, b) => a.multipv - b.multipv)
          .slice(0, activeAnalysisLimit());
        snapshotFullPositionAnalysis();
        renderMeta();
        renderAnalysisFull();
        renderBoardOverlay();
        applyUpdatedSearchSettings();
        restartSearchIfNeeded();
      },
      // React bridge API:
      doMove: (uci) => applyPrincipalMove(uci),
      goToNode: (nodeId) => goToNode(nodeRegistry.get(nodeId) || null),
      navigateBack: () => navigateBack(),
      navigateForward: () => navigateForward(),
      navigateStart: () => navigateStart(),
      navigateEnd: () => navigateEnd(),
      navigateSibling: (delta) => navigateSibling(delta),
      newGame: () => newGame(),
      flipBoard: () => flipBoard(),
      selectSquare: (square) => handleSquareSelection(square),
      startAnalysis: (mode) => startAnalysis(mode),
      haltEngine: (explicit) => haltEngine(explicit),
      nodeRegistry: {
        get: (id) => nodeRegistry.get(id) || null,
        entries: () => nodeRegistry.entries(),
      },
      // React sync: call this after renderAll() so React knows to re-render
    };
    window.addEventListener("beforeunload", flushPersistedAnalysisCaches);
    window.addEventListener("beforeunload", flushPersistedBoardState);
  }

  function renderAll() {
    renderMeta();
    renderOpening();
    renderBoard();
    renderHistory();
    renderMovePanel();
    renderEvalChart();
    renderAnalysisFull();
    schedulePatternDetection();
    renderAssistant();
    renderEngineStatus();
    renderGlobalLoader();
    schedulePersistedBoardStateSave();
    window.__chessSomething._renderCount += 1;
  }

  function ensureAudioContext() {
    if (audioCtx) return audioCtx;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    try {
      audioCtx = new AudioCtor();
    } catch (_) {
      audioCtx = null;
    }
    return audioCtx;
  }

  function resumeAudioContext() {
    const ctx = ensureAudioContext();
    if (!ctx || ctx.state !== "suspended") return;
    const resumePromise = ctx.resume();
    if (resumePromise && typeof resumePromise.catch === "function")
      resumePromise.catch(() => {});
  }

  function decodeAudioBuffer(ctx, arrayBuffer) {
    try {
      const maybePromise = ctx.decodeAudioData(arrayBuffer.slice(0));
      if (maybePromise && typeof maybePromise.then === "function")
        return maybePromise;
    } catch (_) {}
    return new Promise((resolve, reject) => {
      try {
        ctx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  function primeSoundBank() {
    const ctx = ensureAudioContext();
    if (!ctx) return Promise.resolve();
    if (soundBankPromise) return soundBankPromise;
    soundBankPromise = Promise.all(
      Object.entries(SOUND_SOURCES).map(async ([name, src]) => {
        if (soundBank.has(name)) return;
        const response = await fetch(src);
        if (!response.ok) throw new Error(`Could not load sound: ${src}`);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = await decodeAudioBuffer(ctx, arrayBuffer);
        soundBank.set(name, buffer);
      }),
    ).catch((error) => {
      console.warn("Could not prime sound bank", error);
      soundBankPromise = null;
    });
    return soundBankPromise;
  }

  function moveRecordIsCapture(move) {
    if (!move) return false;
    if (move.captured) return true;
    if (typeof move.flags === "string" && /[ce]/.test(move.flags)) return true;
    if (typeof move.san === "string" && move.san.includes("x")) return true;
    return false;
  }

  function soundNameForMoveRecord(move) {
    return moveRecordIsCapture(move) ? "capture" : "move";
  }

  function soundNameForNode(node) {
    if (!node) return null;
    return node.isCapture ||
      (typeof node.san === "string" && node.san.includes("x"))
      ? "capture"
      : "move";
  }

  function playNamedSound(name) {
    if (!name) return;
    const ctx = ensureAudioContext();
    const buffer = soundBank.get(name);
    if (!ctx || !buffer) return;
    const play = () => {
      try {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      } catch (_) {}
    };
    if (ctx.state === "running") {
      play();
      return;
    }
    const resumePromise = ctx.resume();
    if (resumePromise && typeof resumePromise.then === "function") {
      resumePromise.then(play).catch(() => {});
      return;
    }
    play();
  }

  function renderGlobalLoader() {
    if (!ui.globalLoader) return;
    ui.globalLoader.classList.toggle("open", !!state.importBusy);
    ui.globalLoader.setAttribute(
      "aria-hidden",
      state.importBusy ? "false" : "true",
    );
  }

  function renderMeta() {
    const game = currentGame();
    if (isArcadeMode()) {
      const variant = currentArcadeVariant();
      const terminal = terminalPositionInfo(game);
      ui.analysisMeta.textContent = terminal
        ? terminal.shortLabel
        : state.arcadeThinking
          ? `${variant.aiName} thinking`
          : currentTurnColor(game) === variant.playerColor
            ? "Your move"
            : `${variant.aiName} to move`;
      ui.haltBtn.textContent = "Hide lines";
      ui.haltBtn.classList.remove("primary");
      return;
    }
    const focusMoves = selectedLegalMoves(game);
    const visibleCount = panelAnalysisRows(game).length;
    const terminal = terminalPositionInfo(game);
    renderSearchSummary();
    ui.analysisMeta.textContent = state.engineLinesHidden
      ? "Hidden"
      : state.awaitingImportedPgnAnalysis
        ? ""
        : terminal
          ? terminal.shortLabel
          : state.selectedSquare
            ? visibleCount
              ? `${visibleCount}/${focusMoves.length} moves from ${state.selectedSquare}`
              : focusMoves.length
                ? `Evaluating ${focusMoves.length} moves from ${state.selectedSquare}`
                : `No legal moves from ${state.selectedSquare}`
            : visibleCount
              ? `${visibleCount} ${visibleCount === 1 ? "line" : "lines"}`
              : "Waiting for engine info";
    ui.haltBtn.textContent = state.engineLinesHidden
      ? "Show lines"
      : "Hide lines";
    ui.haltBtn.classList.toggle("primary", state.engineLinesHidden);
  }

  function renderOpening() {
    if (!ui.openingTrail) return;
    if (isArcadeMode()) {
      const markup = escapeHtml(currentArcadeVariant().title);
      ui.openingTrail.innerHTML = markup;
      _lastOpeningTrailMarkup = markup;
      ui.openingTrail.classList.remove("loading");
      ui.openingTrail.style.visibility = "visible";
      if (ui.openingPanelTitle) {
        ui.openingPanelTitle.innerHTML = markup;
        ui.openingPanelTitle.classList.remove("loading");
      }
      return;
    }
    const opening = state.openingInfo;
    // The title is always derived from the local opening book (state.openingInfo).
    // Wiki data (state.openingWiki) is supplemental only and must never override
    // the book-derived name in the top-bar.
    const titleFromBook = opening?.name || null;
    const titleFromWiki = state.openingWiki?.title || null;
    // Book title takes priority; wiki title is only shown as fallback if book has none.
    const chosenTitle = titleFromBook || titleFromWiki;
    const rootFallbackTitle =
      !state.current?.parent && !chosenTitle && !state.openingLoading
        ? state.current?.label || "Start position"
        : null;
    let markup = "";
    let visible = false;
    if (chosenTitle) {
      markup = escapeHtml(chosenTitle);
      visible = true;
    } else if (rootFallbackTitle) {
      markup = escapeHtml(rootFallbackTitle);
      visible = true;
    } else if (state.openingLoading) {
      markup =
        '<div class="loading-dots" aria-hidden="true"><span></span><span></span><span></span></div>';
      visible = true;
    }
    const changed = markup !== _lastOpeningTrailMarkup;
    console.log("OPENING render", {
      titleFromBook,
      titleFromWiki,
      chosenTitle,
      currentFen: state.current?.fen,
    });
    if (changed) {
      ui.openingTrail.innerHTML = markup;
      _lastOpeningTrailMarkup = markup;
      if (visible) {
        ui.openingTrail.classList.remove("swap");
        void ui.openingTrail.offsetWidth;
        ui.openingTrail.classList.add("swap");
      } else {
        ui.openingTrail.classList.remove("swap");
      }
    }
    ui.openingTrail.classList.toggle(
      "loading",
      !!state.openingLoading && !chosenTitle,
    );
    ui.openingTrail.style.visibility = visible ? "visible" : "hidden";

    if (ui.openingPanelTitle) {
      ui.openingPanelTitle.innerHTML = markup || escapeHtml("Start position");
      ui.openingPanelTitle.classList.toggle(
        "loading",
        !!state.openingLoading && !chosenTitle,
      );
    }

  }

  function renderEngineStatus() {
    if (ui.engineHint)
      ui.engineHint.textContent = state.engineHint || state.engineStatus;
    _lastRenderedStatus = state.engineStatus;
    _lastRenderedHint = state.engineHint;
    scheduleTopbarLayoutSync();
  }

  function scheduleTopbarLayoutSync() {
    if (_topbarLayoutRaf) return;
    _topbarLayoutRaf = requestAnimationFrame(() => {
      _topbarLayoutRaf = 0;
      syncTopbarLayout();
    });
  }

  function syncTopbarLayout() {
    if (!ui.topbar || !ui.brandBlock || !ui.statusBlock) return;
    const brandWidth = Math.ceil(
      ui.brandBlock.getBoundingClientRect().width || 0,
    );
    const statusWidth = Math.ceil(
      ui.statusBlock.getBoundingClientRect().width || 0,
    );
    const sideWidth = Math.max(brandWidth, statusWidth, 260);
    ui.topbar.style.setProperty("--topbar-side-width", `${sideWidth}px`);
  }

  function renderHistory() {
    const path = visibleHistoryPath();
    let html = "";
    const displayNode = currentDisplayNode();
    if (path.length === 1) {
      html = "";
      if (ui.historyTrail.innerHTML !== html || html !== _lastHistoryHtml) {
        ui.historyTrail.innerHTML = html;
        _lastHistoryHtml = html;
      }
      return;
    }
    const moves = path.slice(1);
    const currentIndex = Math.max(
      0,
      moves.findIndex((node) => node.id === displayNode?.id),
    );
    let normalStart = Math.max(0, currentIndex - 4);
    let normalEnd = Math.min(moves.length - 1, currentIndex + 4);
    while (
      normalEnd - normalStart < 8 &&
      (normalStart > 0 || normalEnd < moves.length - 1)
    ) {
      if (normalStart > 0) normalStart -= 1;
      if (normalEnd - normalStart >= 8) break;
      if (normalEnd < moves.length - 1) normalEnd += 1;
    }
    const visibleStart = Math.max(0, normalStart - 3);
    const visibleEnd = Math.min(moves.length - 1, normalEnd + 3);
    html = moves
      .slice(visibleStart, visibleEnd + 1)
      .map((node, localIndex) => {
        const index = visibleStart + localIndex;
        let fadeClass = "";
        if (index < normalStart) {
          const distance = normalStart - index;
          fadeClass = ` fade-${Math.min(3, distance)}`;
        } else if (index > normalEnd) {
          const distance = index - normalEnd;
          fadeClass = ` fade-${Math.min(3, distance)}`;
        }
        return `<button class="history-move${node.id === displayNode?.id ? " current" : ""}${fadeClass}" data-node-id="${node.id}"><span class="history-label">${escapeHtml(nodeDisplayLabel(node))}</span></button>`;
      })
      .join("");
    if (html !== _lastHistoryHtml) {
      ui.historyTrail.innerHTML = html;
      _lastHistoryHtml = html;
    }
  }

  function renderMovePanel() {
    if (!ui.movePanelList || !ui.movePanelMeta) return;
    const path = visibleHistoryPath();
    const moves = path.slice(1);
    const displayNode = currentDisplayNode();

    if (!moves.length) {
      ui.movePanelMeta.textContent = "No moves yet";
      ui.movePanelList.innerHTML =
        '<div class="board-history-empty">No moves yet</div>';
      return;
    }

    ui.movePanelMeta.textContent = `${moves.length} ${moves.length === 1 ? "move" : "moves"}`;

    const currentIndex = moves.findIndex((node) => node.id === displayNode?.id);
    const rows = [];

    moves.forEach((node, index) => {
      const parts = String(node.parent?.fen || "").split(" ");
      const turn = parts[1] || "w";
      const fullmove = parseInt(parts[5] || "1", 10);
      const side = turn === "w" ? "white" : "black";
      let row = rows[rows.length - 1] || null;

      if (!row || row.moveNumber !== fullmove) {
        row = {
          moveNumber: fullmove,
          white: "",
          black: "",
        };
        rows.push(row);
      }

      row[side] = movePanelButtonMarkup(node, {
        future: currentIndex >= 0 && index > currentIndex,
      });
    });

    ui.movePanelList.innerHTML = rows
      .map(
        (row) => `
          <div class="board-history-row">
            <span class="board-history-number">${row.moveNumber}.</span>
            <div class="board-history-cell">${row.white}</div>
            <div class="board-history-cell">${row.black}</div>
          </div>
        `,
      )
      .join("");
  }

  function renderEvalChart() {
    const nodes = currentPath().slice(1);
    if (state.awaitingImportedPgnAnalysis) {
      renderEvalBar(null, "0.0");
      if (ui.evalChart.innerHTML) ui.evalChart.innerHTML = "";
      _lastEvalChartHtml = "";
      hideEvalTooltip();
      return;
    }
    const currentEval = currentPositionEval();
    renderEvalBar(currentEval?.value ?? null, currentEval?.label || "0.0");
    if (nodes.length < 3) {
      if (ui.evalChart.innerHTML) ui.evalChart.innerHTML = "";
      _lastEvalChartHtml = "";
      hideEvalTooltip();
      return;
    }

    let lastKnown = 0;
    const items = nodes.map((node, index) => {
      const evalInfo = historyEvalForNode(node);
      if (evalInfo?.hasEval) lastKnown = evalInfo.value;
      const plotted = clampChartEval(
        evalInfo?.hasEval ? evalInfo.value : lastKnown,
      );
      const moveClass = evalChartMoveClass(classificationForHistoryNode(node));
      return {
        node,
        index,
        evalInfo,
        plotted,
        moveClass,
      };
    });
    const evaluated = items.filter((item) => item.evalInfo?.hasEval).length;

    if (!evaluated) {
      if (ui.evalChart.innerHTML) ui.evalChart.innerHTML = "";
      _lastEvalChartHtml = "";
      hideEvalTooltip();
      return;
    }

    const width = 640;
    const height = 220;
    const padX = 12;
    const padY = 10;
    const minX = padX;
    const maxX = width - padX;
    const spanX = Math.max(maxX - minX, 1);
    const stepX = items.length > 1 ? spanX / (items.length - 1) : 0;
    const domain = chartScaleDomain(items.map((item) => item.plotted));
    const baselineY = evalToChartY(0, height, padY, domain);
    const points = items.map((item, index) => ({
      ...item,
      x: items.length > 1 ? minX + stepX * index : width / 2,
      y: evalToChartY(item.plotted, height, padY, domain),
    }));
    const curvePath = buildChartLinePath(points);
    const areaPath = buildChartAreaPath(points, height - padY);

    const chartHtml = `
      <rect class="chart-bg" x="${padX}" y="${padY}" width="${width - padX * 2}" height="${height - padY * 2}" rx="3"></rect>
      <path class="curve-fill" d="${areaPath}"></path>
      <path class="curve-line" d="${curvePath}"></path>
      <line class="zero-line" x1="${minX}" y1="${baselineY}" x2="${maxX}" y2="${baselineY}"></line>
      ${points
        .map(
          (point) => `
        <g data-node-id="${point.node.id}" data-eval="${escapeHtml(point.evalInfo?.label || formatChartEval(point.plotted))}" data-move="${escapeHtml(nodeDisplayLabel(point.node))}" data-class-label="${escapeHtml(point.moveClass?.label || "")}" data-class-icon="${escapeHtml(point.moveClass?.icon || "")}">
          ${renderEvalPointMarker(point)}
        </g>
      `,
        )
        .join("")}
    `;
    if (chartHtml !== _lastEvalChartHtml) {
      ui.evalChart.innerHTML = chartHtml;
      _lastEvalChartHtml = chartHtml;
    }
  }

  function currentPositionEval() {
    const fen = state.current?.fen;
    const stableRows = stableFullPositionRowsForFen(fen);
    if (stableRows.length) return whiteCentricEvalInfo(stableRows[0], fen);
    if (state.current?.parent) return historyEvalForNode(state.current);
    return null;
  }

  function currentFullPositionRows() {
    return fullPositionRowsForFen(state.current.fen);
  }

  function matchingCachedFullAnalysisForFen(fen) {
    if (!fen) return null;
    return (state.cachedFullAnalysis?.fen || "") === fen
      ? state.cachedFullAnalysis
      : null;
  }

  function stableFullPositionRowsForFen(fen) {
    if (!fen) return [];
    const cachedEntry =
      state.positionAnalysisCache.get(fen) || matchingCachedFullAnalysisForFen(fen);
    return sanitizeAnalysisRows(cachedEntry?.rows || [], fen);
  }

  function historyEvalForNode(node) {
    if (!node) return null;
    const positionRows = fullPositionRowsForFen(node.fen);
    if (positionRows.length)
      return whiteCentricEvalInfo(positionRows[0], node.fen);
    if (!node.parent || !node.uci) return null;
    const parentRows = fullPositionRowsForFen(node.parent.fen);
    const row = parentRows.find((entry) => entry.bestUci === node.uci);
    if (!row) return null;
    return whiteCentricEvalInfo(row, node.parent.fen);
  }

  function fullPositionRowsForFen(fen) {
    if (!fen) return [];
    if (fen === state.current?.fen) {
      if (!state.selectedSquare && state.analysisRows.length)
        return sanitizeAnalysisRows(state.analysisRows, fen);
      const entry =
        state.positionAnalysisCache.get(fen) || matchingCachedFullAnalysisForFen(fen);
      return sanitizeAnalysisRows(entry?.rows || [], fen);
    }
    // For non-current positions, check positionAnalysisCache first before falling back to analysisRowsForFen
    const cached =
      state.positionAnalysisCache.get(fen) || matchingCachedFullAnalysisForFen(fen);
    if (cached?.rows?.length) return sanitizeAnalysisRows(cached.rows, fen);
    const nextPlyEntry = state.nextPlyAnalysisCache.get(fen);
    if (nextPlyEntry?.rows?.length)
      return sanitizeAnalysisRows(nextPlyEntry.rows, fen);
    return sanitizeAnalysisRows(analysisRowsForFen(fen), fen);
  }

  function whiteCentricEvalInfo(row, fen) {
    if (!row || !fen) return null;
    const turn = String(fen).split(" ")[1] || "w";
    const perspective = turn === "w" ? 1 : -1;
    if (Number.isFinite(row.mate)) {
      const signedMate = row.mate * perspective;
      return {
        hasEval: true,
        value: signedMate > 0 ? 20 : -20,
        label: signedMate < 0 ? `-#${Math.abs(signedMate)}` : `#${signedMate}`,
      };
    }
    const cp = Number.isFinite(row.scoreCp) ? row.scoreCp * perspective : 0;
    const value = cp / 100;
    return {
      hasEval: true,
      value,
      label: formatChartEval(value),
    };
  }

  function displayAnalysisEvalText(row, fen) {
    const evalInfo = whiteCentricEvalInfo(row, fen);
    if (evalInfo?.label) return evalInfo.label;
    if (Number.isFinite(row?.mate))
      return row.mate < 0 ? `-#${Math.abs(row.mate)}` : `#${row.mate}`;
    return formatEval(row?.scoreCp);
  }

  function clampEvalBarValue(value) {
    return Math.max(-10, Math.min(10, Number(value) || 0));
  }

  function clampChartEval(value) {
    return Math.max(-20, Math.min(20, Number(value) || 0));
  }

  function chartScaleDomain(values) {
    const finite = values
      .filter((value) => Number.isFinite(value))
      .map((value) => clampChartEval(value));
    if (!finite.length) return { min: -20, max: 20 };
    return { min: -20, max: 20 };
  }

  function evalToChartY(
    value,
    height,
    padY,
    domain = chartScaleDomain([value]),
  ) {
    const usableHeight = Math.max(1, height - padY * 2);
    const clamped = Math.max(
      domain.min,
      Math.min(domain.max, Number(value) || 0),
    );
    const span = Math.max(0.001, domain.max - domain.min);
    return padY + ((domain.max - clamped) / span) * usableHeight;
  }

  function buildChartLinePath(points) {
    if (!points.length) return "";
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1];
      const curr = points[i];
      const midX = (prev.x + curr.x) / 2;
      path += ` C ${midX} ${prev.y}, ${midX} ${curr.y}, ${curr.x} ${curr.y}`;
    }
    return path;
  }

  function buildChartAreaPath(points, bottomY) {
    if (!points.length) return "";
    let path = `M ${points[points.length - 1].x} ${bottomY} L ${points[0].x} ${bottomY} L ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1];
      const curr = points[i];
      const midX = (prev.x + curr.x) / 2;
      path += ` C ${midX} ${prev.y}, ${midX} ${curr.y}, ${curr.x} ${curr.y}`;
    }
    path += " Z";
    return path;
  }

  function evalChartMoveClass(moveClass) {
    if (!moveClass) return null;
    if (moveClass === MOVE_CLASS_STYLES.brilliant)
      return MOVE_CLASS_STYLES.brilliant;
    if (moveClass === MOVE_CLASS_STYLES.critical)
      return MOVE_CLASS_STYLES.critical;
    if (moveClass === MOVE_CLASS_STYLES.okay) return MOVE_CLASS_STYLES.okay;
    if (moveClass === MOVE_CLASS_STYLES.inaccuracy)
      return MOVE_CLASS_STYLES.inaccuracy;
    if (moveClass === MOVE_CLASS_STYLES.mistake)
      return MOVE_CLASS_STYLES.mistake;
    if (moveClass === MOVE_CLASS_STYLES.blunder)
      return MOVE_CLASS_STYLES.blunder;
    return null;
  }

  function renderEvalPointMarker(point) {
    const moveClass = point.moveClass;
    const isImportant =
      point.node.id === state.current.id ||
      moveClass === MOVE_CLASS_STYLES.brilliant ||
      moveClass === MOVE_CLASS_STYLES.critical ||
      moveClass === MOVE_CLASS_STYLES.inaccuracy ||
      moveClass === MOVE_CLASS_STYLES.mistake ||
      moveClass === MOVE_CLASS_STYLES.blunder;
    if (!isImportant) return "";
    const notableFill = resolveThemeColor(moveClass?.color || "var(--app-text)");
    const dotRadius = point.node.id === state.current.id ? 4.4 : 3.3;
    return `
      <g class="point-marker${point.node.id === state.current.id ? " current" : ""}" transform="translate(${point.x} ${point.y})">
        <circle class="point-dot" r="${dotRadius}" fill="${escapeHtml(notableFill)}"></circle>
      </g>
    `;
  }

  function renderEvalBar(value, label) {
    const clamped = clampEvalBarValue(value);
    const whiteShare = ((clamped + 10) / 20) * 100;
    ui.evalBarFill.style.height = `${Math.max(0, Math.min(100, whiteShare))}%`;
    ui.evalBarValue.textContent = String(label || "0.0").replace(/^\+/, "");
  }

  function formatChartEval(value) {
    const n = Number(value) || 0;
    const fixed = Math.abs(n).toFixed(1);
    return n < 0 ? `-${fixed}` : fixed;
  }

  function showEvalTooltip(element, event) {
    const icon = element.dataset.classIcon
      ? `<img src="${element.dataset.classIcon}" alt="${element.dataset.classLabel} icon">`
      : "";
    ui.evalTooltip.innerHTML = `
      <div class="icon-row">${icon}<span class="value">${escapeHtml(element.dataset.eval || "0.0")}</span></div>
      <div>${escapeHtml(element.dataset.move || "")}</div>
      <div class="small">${escapeHtml(element.dataset.classLabel || "")}</div>
    `;
    const rect = ui.evalChart.getBoundingClientRect();
    const wrapRect = ui.evalTooltip.parentElement.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(rect.width - 170, event.clientX - wrapRect.left + 12),
    );
    const top = Math.max(
      8,
      Math.min(rect.height - 86, event.clientY - wrapRect.top - 18),
    );
    ui.evalTooltip.style.left = `${left}px`;
    ui.evalTooltip.style.top = `${top}px`;
    ui.evalTooltip.classList.add("visible");
  }

  function hideEvalTooltip() {
    ui.evalTooltip.classList.remove("visible");
  }

  function visibleHistoryPath() {
    const currentId = state.current?.id || "";
    if (
      _cachedVisibleHistoryPath &&
      _cachedVisibleHistoryPathNodeId === currentId
    )
      return _cachedVisibleHistoryPath;
    const path = currentPath();
    let cursor = state.current;
    while (cursor?.children?.length) {
      const preferredId = cursor.mainlineChildId || cursor.preferredChildId;
      const next =
        cursor.children.find((child) => child.id === preferredId) ||
        cursor.children[0];
      if (!next) break;
      path.push(next);
      cursor = next;
    }
    _cachedVisibleHistoryPathNodeId = currentId;
    _cachedVisibleHistoryPath = path;
    return path;
  }

  function scheduleOverlayHoverRender() {
    if (_overlayRafPending) return;
    _overlayRafPending = true;
    requestAnimationFrame(() => {
      _overlayRafPending = false;
      renderAnalysisHoverOnly();
      renderBoardOverlay();
    });
  }

  function indexBoardSquares() {
    _boardSquareElements.clear();
    ui.boardGrid.querySelectorAll("[data-square]").forEach((element) => {
      if (!(element instanceof HTMLElement)) return;
      const square = element.dataset.square || "";
      if (square) _boardSquareElements.set(square, element);
    });
  }

  function renderBoardShell(game) {
    const squares = [];
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const square = coordsToSquare(col, row, state.orientation);
        const isLight = (row + col) % 2 === 0;
        const piece = game.get(square);
        const draggable = piece && piece.color === game.turn();
        squares.push(`
          <button class="square ${isLight ? "light" : "dark"}${draggable ? " draggable" : ""}" data-square="${square}">
            ${col === 0 ? `<span class="coord rank ${isLight ? "darktxt" : "lighttxt"}">${square[1]}</span>` : ""}
            ${row === 7 ? `<span class="coord file ${isLight ? "darktxt" : "lighttxt"}">${square[0]}</span>` : ""}
          </button>
        `);
      }
    }
    const boardHtml = squares.join("");
    ui.boardGrid.innerHTML = boardHtml;
    _lastBoardHtml = boardHtml;
    indexBoardSquares();
  }

  function renderPiecesLayer(game) {
    const pieces = [];
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const square = coordsToSquare(col, row, state.orientation);
        const piece = game.get(square);
        if (
          piece &&
          !(state.dragState?.dragging && state.dragState.from === square)
        ) {
          pieces.push(
            `<div class="piece" style="--x:${col * 100}%;--y:${row * 100}%;"><img src="${pieceAsset(piece)}" alt="${piece.color}${piece.type}" draggable="false"></div>`,
          );
        }
      }
    }
    const piecesHtml = pieces.join("");
    ui.piecesLayer.innerHTML = piecesHtml;
    _lastPiecesHtml = piecesHtml;
  }

  function syncBoardSquareDecorations(
    lastMove,
    lastMoveClass,
    checkedSquare,
    lastMoveFromFill,
    lastMoveToFill,
  ) {
    const selectedSquare = state.selectedSquare || "";
    const dragOrigin = state.dragState?.dragging
      ? state.dragState.from || ""
      : "";
    const dragTarget = state.dragState?.dragging
      ? state.dragState.hoverSquare || ""
      : "";
    const lastFrom = lastMove?.from || "";
    const lastTo = lastMove?.to || "";
    for (const [square, squareEl] of _boardSquareElements) {
      const isLastFrom = square === lastFrom;
      const isLastTo = square === lastTo;
      squareEl.classList.toggle("selected", square === selectedSquare);
      squareEl.classList.toggle("checked", square === checkedSquare);
      squareEl.classList.toggle("last-from", isLastFrom);
      squareEl.classList.toggle("last-to", isLastTo);
      squareEl.classList.toggle("drag-origin", square === dragOrigin);
      squareEl.classList.toggle("drag-target", square === dragTarget);
      if (isLastFrom)
        squareEl.style.setProperty("--last-move-fill", lastMoveFromFill);
      else if (isLastTo)
        squareEl.style.setProperty("--last-move-fill", lastMoveToFill);
      else squareEl.style.removeProperty("--last-move-fill");
      let iconEl = squareEl.querySelector(".last-move-icon");
      if (isLastTo && lastMoveClass?.icon) {
        if (!(iconEl instanceof HTMLElement)) {
          iconEl = document.createElement("span");
          iconEl.className = "last-move-icon";
          iconEl.innerHTML = '<img alt="">';
          squareEl.appendChild(iconEl);
        }
        iconEl.title = lastMoveClass.label || "";
        const img = iconEl.querySelector("img");
        if (img instanceof HTMLImageElement) {
          img.src = lastMoveClass.icon;
          img.alt = `${lastMoveClass.label} icon`;
        }
      } else if (iconEl) {
        iconEl.remove();
      }
    }
  }

  function renderBoard() {
    const displayNode = currentDisplayNode();
    const game = currentDisplayGame();
    applyBoardThemeToBoardShell();
    const boardStructureKey = `${displayNode?.fen || state.current.fen}|${state.orientation}|${state.boardTheme}`;
    const piecesKey = `${boardStructureKey}|${state.pieceTheme}|${state.dragState?.dragging ? state.dragState.from || "" : ""}`;
    const lastMove = displayNode?.uci ? parseUci(displayNode.uci) : null;
    const lastMoveClass = displayNode?.parent
      ? classificationForHistoryNode(displayNode)
      : null;
    const lastMoveFromFill = moveHighlightFill(lastMoveClass, 0.34);
    const lastMoveToFill = moveHighlightFill(lastMoveClass, 0.52);
    const checkedSquare = checkedKingSquare(game);
    const boardDecorationKey = `${state.selectedSquare || ""}|${checkedSquare || ""}|${lastMove?.from || ""}|${lastMove?.to || ""}|${lastMoveClass?.label || ""}|${state.dragState?.dragging ? state.dragState.from || "" : ""}|${state.dragState?.dragging ? state.dragState.hoverSquare || "" : ""}`;
    if (boardStructureKey !== _lastBoardStructureKey) {
      renderBoardShell(game);
      _lastBoardStructureKey = boardStructureKey;
      _lastBoardDecorationKey = "";
    }
    if (piecesKey !== _lastPiecesKey) {
      renderPiecesLayer(game);
      _lastPiecesKey = piecesKey;
    }
    if (boardDecorationKey !== _lastBoardDecorationKey) {
      syncBoardSquareDecorations(
        lastMove,
        lastMoveClass,
        checkedSquare,
        lastMoveFromFill,
        lastMoveToFill,
      );
      _lastBoardDecorationKey = boardDecorationKey;
    }
    const importedProgress = state.awaitingImportedPgnAnalysis
      ? importedPgnAnalysisProgress()
      : null;
    ui.boardShell.classList.toggle(
      "import-playback",
      importedPgnPlaybackActive(),
    );
    if (importedPgnPlaybackActive() && importedProgress) {
      ui.boardShell.setAttribute(
        "data-analysis-label",
        `Analyzing imported game ${importedProgress.complete}/${importedProgress.total || 0}`,
      );
    } else {
      ui.boardShell.removeAttribute("data-analysis-label");
    }
    ui.legalLayer.innerHTML = "";
    renderBoardAnnotations();
    renderBoardPlayerInfo(displayNode || state.current || null);

    if (!boardBound) {
      ui.boardGrid.addEventListener("click", onBoardClick);
      ui.boardGrid.addEventListener("pointerdown", onBoardPointerDown);
      ui.boardGrid.addEventListener("contextmenu", onBoardContextMenu);
      ui.boardGrid.addEventListener("dblclick", suppressBoardSelection);
      ui.boardGrid.addEventListener("selectstart", suppressBoardSelection);
      ui.boardGrid.addEventListener("dragstart", suppressBoardSelection);
      ui.boardGrid.addEventListener(
        "mousedown",
        suppressBoardSelectionOnRepeat,
      );
      ui.overlayHit.addEventListener("click", onOverlayClick);
      ui.overlayHit.addEventListener("pointerdown", onBoardPointerDown);
      ui.overlayHit.addEventListener("contextmenu", onBoardContextMenu);
      ui.overlayHit.addEventListener("pointermove", onOverlayHover);
      ui.overlayHit.addEventListener("dblclick", suppressBoardSelection);
      ui.overlayHit.addEventListener("selectstart", suppressBoardSelection);
      ui.overlayHit.addEventListener("dragstart", suppressBoardSelection);
      ui.overlayHit.addEventListener(
        "mousedown",
        suppressBoardSelectionOnRepeat,
      );
      ui.overlayHit.addEventListener("mouseleave", () => {
        state.hoveredUci = null;
        scheduleOverlayHoverRender();
        schedulePatternDetection();
      });
      boardBound = true;
    }

    renderBoardOverlay();
    renderDragPiece();
  }

  function normalizePlayerName(value, fallback) {
    const name = String(value || "").trim();
    return name || fallback;
  }

  function normalizePlayerRating(value) {
    const raw = String(value || "").trim();
    if (!raw || raw === "?" || raw === "-") return "";
    return raw;
  }

  function normalizeClockDisplay(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const cleaned = raw
      .replace(/^"+|"+$/g, "")
      .replace(/^'+|'+$/g, "")
      .trim();
    return cleaned;
  }

  function setPlayerNames(whiteName, blackName) {
    state.whitePlayerName = normalizePlayerName(whiteName, "White");
    state.blackPlayerName = normalizePlayerName(blackName, "Black");
  }

  function setPlayerRatings(whiteRating, blackRating) {
    state.whitePlayerRating = normalizePlayerRating(whiteRating);
    state.blackPlayerRating = normalizePlayerRating(blackRating);
  }

  function arcadeDisplayIdentityForColor(color) {
    if (!isArcadeMode()) return null;
    const variant = currentArcadeVariant();
    if (!variant) return null;
    if (color === variant.playerColor) {
      return {
        name: variant.playerName || "",
        rating: "",
      };
    }
    if (color !== variant.aiColor) return null;
    const rating =
      variant.mode === "maia-drift"
        ? String(Math.max(600, Math.round(Number(state.arcadeHiddenElo) || variant.opponentElo || 1500)))
        : variant.mode === "maia-fixed"
          ? String(Math.round(Number(variant.opponentElo) || 1500))
          : "";
    return {
      name: variant.aiName || "",
      rating,
    };
  }

  function setImportedPlayerIdentity(whiteName, blackName, whiteRating, blackRating) {
    state.importedWhitePlayerName = normalizePlayerName(whiteName, "");
    state.importedBlackPlayerName = normalizePlayerName(blackName, "");
    state.importedWhitePlayerRating = normalizePlayerRating(whiteRating);
    state.importedBlackPlayerRating = normalizePlayerRating(blackRating);
  }

  function clearImportedPlayerIdentity() {
    state.importedWhitePlayerName = "";
    state.importedBlackPlayerName = "";
    state.importedWhitePlayerRating = "";
    state.importedBlackPlayerRating = "";
  }

  function clearPlayerClockMap() {
    state.playerClockByNodeId = new Map();
  }

  function setPlayerClockSnapshotForNode(nodeId, whiteClock, blackClock) {
    const id = String(nodeId || "").trim();
    if (!id) return;
    const white = normalizeClockDisplay(whiteClock);
    const black = normalizeClockDisplay(blackClock);
    if (!white && !black) return;
    state.playerClockByNodeId.set(id, { white, black });
  }

  function playerClockSnapshotForNode(node) {
    const id = String(node?.id || "").trim();
    if (!id) return { white: "", black: "" };
    const snapshot = state.playerClockByNodeId.get(id);
    if (!snapshot) return { white: "", black: "" };
    return {
      white: normalizeClockDisplay(snapshot.white),
      black: normalizeClockDisplay(snapshot.black),
    };
  }

  function extractPgnClockTags(pgnText) {
    const source = String(pgnText || "");
    const tags = [];
    const pattern = /\[%clk\s+([^\]\r\n]+)\]/gi;
    let match = pattern.exec(source);
    while (match) {
      const value = normalizeClockDisplay(match[1]);
      if (value) tags.push(value);
      match = pattern.exec(source);
    }
    return tags;
  }

  function sideToMoveForFen(fen) {
    const targetFen = String(fen || "").trim() || START_FEN;
    let game = readOnlyGameForFen(targetFen);
    if (!game) {
      try {
        game = new Chess(targetFen);
      } catch (_) {
        return "white";
      }
    }
    return game.turn() === "b" ? "black" : "white";
  }

  function readPgnHeaderValue(headers, key) {
    if (!headers || typeof headers !== "object") return "";
    const direct = headers[key];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    const lower = headers[String(key || "").toLowerCase()];
    if (typeof lower === "string" && lower.trim()) return lower.trim();
    const target = String(key || "").toLowerCase();
    for (const [entryKey, entryValue] of Object.entries(headers)) {
      if (
        String(entryKey || "").toLowerCase() === target &&
        typeof entryValue === "string" &&
        entryValue.trim()
      ) {
        return entryValue.trim();
      }
    }
    return "";
  }

  function extractPgnHeaderTag(text, key) {
    const source = String(text || "");
    const target = String(key || "").trim();
    if (!source || !target) return "";
    const escapedKey = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = source.match(new RegExp(`\\[${escapedKey}\\s+"([^"]*)"\\]`, "i"));
    return match?.[1]?.trim() || "";
  }

  function playerMetadataFromPgnText(text) {
    const source = String(text || "");
    if (!source.trim()) {
      return {
        whiteName: "",
        blackName: "",
        whiteRating: "",
        blackRating: "",
      };
    }
    return {
      whiteName: extractPgnHeaderTag(source, "White"),
      blackName: extractPgnHeaderTag(source, "Black"),
      whiteRating:
        extractPgnHeaderTag(source, "WhiteElo") ||
        extractPgnHeaderTag(source, "WhiteRating") ||
        extractPgnHeaderTag(source, "WhiteUSCF"),
      blackRating:
        extractPgnHeaderTag(source, "BlackElo") ||
        extractPgnHeaderTag(source, "BlackRating") ||
        extractPgnHeaderTag(source, "BlackUSCF"),
    };
  }

  function timeoutLoserColorFromPgn(headers, pgnText) {
    const termination = readPgnHeaderValue(headers, "Termination").toLowerCase();
    const result = readPgnHeaderValue(headers, "Result").trim();
    const normalizedText = String(pgnText || "").toLowerCase();
    const endedOnTime =
      termination.includes("time forfeit") ||
      termination.includes("timeout") ||
      termination.includes("out of time") ||
      normalizedText.includes("wins on time");
    if (!endedOnTime) return "";
    if (result === "1-0") return "black";
    if (result === "0-1") return "white";
    return "";
  }

  function emptyPieceCountMap() {
    return { p: 0, n: 0, b: 0, r: 0, q: 0 };
  }

  function pieceCountsForFen(fen) {
    const counts = {
      white: emptyPieceCountMap(),
      black: emptyPieceCountMap(),
    };
    let game = readOnlyGameForFen(fen);
    if (!game) {
      try {
        game = new Chess(fen);
      } catch (_) {
        return counts;
      }
    }
    const board = game.board();
    for (const rank of board) {
      for (const piece of rank) {
        if (!piece || piece.type === "k") continue;
        const bucket = piece.color === "w" ? counts.white : counts.black;
        if (bucket[piece.type] !== undefined) bucket[piece.type] += 1;
      }
    }
    return counts;
  }

  function capturedPieceCounts(baseCounts, currentCounts) {
    const captured = emptyPieceCountMap();
    for (const type of Object.keys(captured)) {
      const base = Number(baseCounts?.[type] || 0);
      const current = Number(currentCounts?.[type] || 0);
      captured[type] = Math.max(0, base - current);
    }
    return captured;
  }

  function capturedMaterialScore(counts) {
    let total = 0;
    for (const [type, count] of Object.entries(counts || {})) {
      total += (PIECE_VALUES[type] || 0) * Math.max(0, Number(count) || 0);
    }
    return total;
  }

  function capturedPieceIconsMarkup(capturedColor, counts) {
    const order = ["q", "r", "b", "n", "p"];
    const icons = [];
    const toneClass = capturedColor === "black" ? " captured-piece-dark" : "";
    for (const type of order) {
      const count = Math.max(0, Number(counts?.[type] || 0));
      if (!count) continue;
      const code = `${capturedColor === "white" ? "w" : "b"}${type.toUpperCase()}`;
      const src = pieceThemeAsset(state.pieceTheme, code);
      for (let i = 0; i < count; i += 1) {
        icons.push(
          `<img class="captured-piece${toneClass}" src="${escapeHtml(src)}" alt="${escapeHtml(code)}" draggable="false">`,
        );
      }
    }
    return icons.length ? icons.join("") : "";
  }

  function capturedMaterialEdgeMarkup(playerColor, edge) {
    const value = Math.max(0, Number(edge) || 0);
    if (!value) return "";
    const code = `${playerColor === "white" ? "w" : "b"}P`;
    const src = pieceThemeAsset(state.pieceTheme, code);
    const toneClass = playerColor === "black" ? " captured-piece-dark" : "";
    return `
      <span class="player-material-edge" aria-label="Material edge plus ${value}">
        <img class="captured-piece player-material-edge-icon${toneClass}" src="${escapeHtml(src)}" alt="" draggable="false">
        <span class="player-material-edge-value">+${escapeHtml(String(value))}</span>
      </span>
    `;
  }

  function renderSinglePlayerInfo(
    targetEl,
    color,
    capturedByWhite,
    capturedByBlack,
    sideToMove,
    clockSnapshot,
  ) {
    if (!targetEl) return;
    const isWhite = color === "white";
    const own = isWhite ? capturedByWhite : capturedByBlack;
    const opp = isWhite ? capturedByBlack : capturedByWhite;
    const order = ["q", "r", "b", "n", "p"];
    const netCounts = {};
    for (const type of order) {
      netCounts[type] = Math.max(0, (own[type] || 0) - (opp[type] || 0));
    }
    const capturedCounts = netCounts;
    const capturedColor = isWhite ? "black" : "white";
    const importedName = isWhite
      ? state.importedWhitePlayerName
      : state.importedBlackPlayerName;
    const importedRating = isWhite
      ? state.importedWhitePlayerRating
      : state.importedBlackPlayerRating;
    const liveName = isWhite ? state.whitePlayerName : state.blackPlayerName;
    const liveRating = isWhite ? state.whitePlayerRating : state.blackPlayerRating;
    const arcadeIdentity = arcadeDisplayIdentityForColor(color);
    const name =
      arcadeIdentity?.name ||
      (liveName === (isWhite ? "White" : "Black") && importedName) ||
      liveName;
    const rating = arcadeIdentity?.rating || liveRating || importedRating;
    const clock = isWhite ? clockSnapshot.white : clockSnapshot.black;
    const isToMove = sideToMove === color;
    const materialEdge = isWhite
      ? capturedMaterialScore(capturedByWhite) - capturedMaterialScore(capturedByBlack)
      : capturedMaterialScore(capturedByBlack) - capturedMaterialScore(capturedByWhite);
    targetEl.innerHTML = `
      <div class="player-id-row">
        <span class="player-turn-dot${isToMove ? " active" : ""}" aria-hidden="true"></span>
        <span class="player-name">${escapeHtml(name)}</span>
        ${
          rating
            ? `<span class="player-rating">${escapeHtml(rating)}</span>`
            : ""
        }
      </div>
      <div class="player-captures">${capturedPieceIconsMarkup(capturedColor, capturedCounts)}${capturedMaterialEdgeMarkup(color, materialEdge)}</div>
      ${
        clock
          ? `<div class="player-clock">${escapeHtml(clock)}</div>`
          : `<div class="player-clock empty"></div>`
      }
    `;
  }

  function renderBoardPlayerInfo(node) {
    if (!ui.topPlayerInfo || !ui.bottomPlayerInfo) return;
    const currentFen = String(node?.fen || state.current?.fen || START_FEN);
    const baseFen = state.root?.fen || START_FEN;
    const baseCounts = pieceCountsForFen(baseFen);
    const currentCounts = pieceCountsForFen(currentFen || baseFen);
    const capturedByWhite = capturedPieceCounts(
      baseCounts.black,
      currentCounts.black,
    );
    const capturedByBlack = capturedPieceCounts(
      baseCounts.white,
      currentCounts.white,
    );
    const sideToMove = sideToMoveForFen(currentFen);
    const clockSnapshot = playerClockSnapshotForNode(node || state.current);
    const bottomColor = state.orientation === "white" ? "white" : "black";
    const topColor = bottomColor === "white" ? "black" : "white";
    renderSinglePlayerInfo(
      ui.topPlayerInfo,
      topColor,
      capturedByWhite,
      capturedByBlack,
      sideToMove,
      clockSnapshot,
    );
    renderSinglePlayerInfo(
      ui.bottomPlayerInfo,
      bottomColor,
      capturedByWhite,
      capturedByBlack,
      sideToMove,
      clockSnapshot,
    );
  }

  function renderBoardAnnotations() {
    const visuals = state.annotations
      .map((annotation) => renderAnnotationVisual(annotation, false))
      .filter(Boolean);
    if (state.annotationDrag?.from) {
      const preview = state.annotationDrag.to
        ? renderAnnotationVisual(
            {
              type:
                state.annotationDrag.to === state.annotationDrag.from
                  ? "circle"
                  : "arrow",
              from: state.annotationDrag.from,
              to: state.annotationDrag.to,
              square: state.annotationDrag.from,
            },
            true,
          )
        : null;
      if (preview) visuals.push(preview);
    }
    ui.annotationSvg.innerHTML = visuals.join("");
  }

  function renderAnnotationVisual(annotation, isPreview) {
    if (!annotation) return "";
    const previewClass = isPreview ? " annotation-preview" : "";
    if (annotation.type === "circle" && annotation.square) {
      const center = squareCenter(annotation.square);
      return `<circle class="annotation-circle${previewClass}" cx="${center.x}" cy="${center.y}" r="40"></circle>`;
    }
    if (annotation.type === "arrow" && annotation.from && annotation.to) {
      const start = squareCenter(annotation.from);
      const end = squareCenter(annotation.to);
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = dx / len;
      const ny = dy / len;
      const px = -ny;
      const py = nx;
      const headLength = 42;
      const headWidth = 42;
      const shaftEndX = end.x - nx * (headLength * 0.74);
      const shaftEndY = end.y - ny * (headLength * 0.74);
      const baseCenterX = end.x - nx * headLength;
      const baseCenterY = end.y - ny * headLength;
      const leftBaseX = baseCenterX + px * (headWidth / 2);
      const leftBaseY = baseCenterY + py * (headWidth / 2);
      const rightBaseX = baseCenterX - px * (headWidth / 2);
      const rightBaseY = baseCenterY - py * (headWidth / 2);
      return `<g class="annotation-arrow${previewClass}"><line x1="${start.x}" y1="${start.y}" x2="${shaftEndX}" y2="${shaftEndY}"></line><polygon points="${end.x},${end.y} ${leftBaseX},${leftBaseY} ${rightBaseX},${rightBaseY}"></polygon></g>`;
    }
    return "";
  }

  function checkedKingSquare(game = currentGame()) {
    const inCheck =
      typeof game?.in_check === "function"
        ? game.in_check()
        : typeof game?.inCheck === "function"
          ? game.inCheck()
          : false;
    if (!inCheck) return null;
    const board = typeof game?.board === "function" ? game.board() : [];
    const color = typeof game?.turn === "function" ? game.turn() : null;
    if (!color) return null;
    for (let rank = 0; rank < board.length; rank += 1) {
      for (let file = 0; file < board[rank].length; file += 1) {
        const piece = board[rank][file];
        if (piece && piece.type === "k" && piece.color === color) {
          return String.fromCharCode(97 + file) + String(8 - rank);
        }
      }
    }
    return null;
  }

  function renderBoardOverlay() {
    const overlayBoardKey = `${state.current?.fen || ""}|${state.selectedSquare || ""}|${state.engineLinesHidden ? "hidden" : "shown"}`;
    const boardChanged = overlayBoardKey !== _lastOverlayBoardKey;
    if (overlayBoardKey !== _lastOverlayBoardKey) {
      clearOverlayGhost();
      _lastOverlayBoardKey = overlayBoardKey;
      _lastOverlaySelectedSquare = state.selectedSquare || null;
      _lastOverlayDataKey = "";
      _lastOverlayEvalMap = new Map();
      _overlayNeedsEntrance = true;
    }
    const game = currentGame();
    if (
      (state.awaitingFinalAnalysis || state.awaitingImportedPgnAnalysis) &&
      !terminalPositionInfo(game)
    ) {
      ui.overlaySvg.innerHTML = "";
      ui.overlayNodeSvg.innerHTML = "";
      ui.overlayHit.innerHTML = "";
      ui.overlayHit.style.pointerEvents = "none";
      _lastOverlayDataKey = "";
      _lastOverlayEvalMap = new Map();
      return;
    }
    const visibleRows = visibleAnalysisRows(game);
    if (state.engineLinesHidden || !visibleRows.length) {
      ui.overlaySvg.innerHTML = "";
      ui.overlayNodeSvg.innerHTML = "";
      ui.overlayHit.innerHTML = "";
      ui.overlayHit.style.pointerEvents = "none";
      _lastOverlayDataKey = "";
      _lastOverlayEvalMap = new Map();
      return;
    }
    const overlayDataKey = visibleRows
      .map(
        (row) =>
          `${row.bestUci}|${row.evalText}|${row.depth || 0}|${row.nodes || 0}`,
      )
      .join("||");
    const changedEvalUcis = new Set();
    if (overlayDataKey !== _lastOverlayDataKey) {
      if (!boardChanged) {
        visibleRows.forEach((row) => {
          const previousEval = _lastOverlayEvalMap.get(row.bestUci);
          if (previousEval !== row.evalText) changedEvalUcis.add(row.bestUci);
        });
      }
      _lastOverlayDataKey = overlayDataKey;
      _lastOverlayEvalMap = new Map(
        visibleRows.map((row) => [row.bestUci, row.evalText]),
      );
      if (boardChanged) _overlayNeedsEntrance = true;
    }
    const lineDefs = [];
    const lineVisuals = [];
    const nodeVisuals = [];
    const hits = [];
    let overlayGradientIndex = 0;
    function overlayGradientStroke(fromPoint, toPoint, startColor, endColor) {
      const start = String(startColor || "").trim();
      const end = String(endColor || "").trim();
      if (!start || !end || start === end) return end || start;
      const blend = mixCssColors(start, end, 0.5);
      const id = `overlay-grad-${overlayGradientIndex++}`;
      lineDefs.push(
        `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${fromPoint.x}" y1="${fromPoint.y}" x2="${toPoint.x}" y2="${toPoint.y}"><stop offset="0%" stop-color="${start}"></stop><stop offset="46%" stop-color="${blend}"></stop><stop offset="100%" stop-color="${end}"></stop></linearGradient>`,
      );
      return `url(#${id})`;
    }
    const overlayCandidates = visibleRows
      .map((row, index) => {
        const parsed = parseUci(row.bestUci);
        if (!parsed) return null;
        const from = squareIndex(parsed.from);
        const to = squareIndex(parsed.to);
        return {
          row,
          index,
          moveClass: classifyDisplayedMove(row, index, visibleRows, game),
          parsed,
          distance:
            Math.abs(to.file - from.file) + Math.abs(to.rank - from.rank),
          stackKey: `${parsed.from}:${rayKey(parsed.from, parsed.to)}`,
        };
      })
      .filter(Boolean);

    const canonicalRows = new Map();
    overlayCandidates.forEach((candidate) => {
      const key = `${candidate.parsed.from}:${candidate.parsed.to}`;
      const existing = canonicalRows.get(key);
      if (!existing || compareOverlayMovePreference(candidate, existing) > 0) {
        canonicalRows.set(key, candidate);
      }
    });

    const rows = Array.from(canonicalRows.values()).sort((a, b) => {
      if (a?.parsed?.to === b?.parsed?.to) {
        const preferenceGap = compareOverlayMovePreference(a, b);
        if (preferenceGap) return preferenceGap;
      }
      if (a.stackKey === b.stackKey)
        return b.distance - a.distance || a.index - b.index;
      return a.index - b.index;
    });
    const activeForkPreviewUci =
      state.hoveredUci ||
      rows[0]?.row?.bestUci ||
      "";

    rows.forEach(({ row, moveClass, parsed }) => {
      const animateDelta = changedEvalUcis.has(row.bestUci)
        ? " overlay-delta"
        : "";
      const start = squareCenter(parsed.from);
      const end = squareCenter(parsed.to);
      const thick = 3;
      const radius = state.hoveredUci === row.bestUci ? 26 : 22;
      const nodeRadius = radius - 8;
      const visualDx = end.x - start.x;
      const visualDy = end.y - start.y;
      const visualLen = Math.max(Math.hypot(visualDx, visualDy), 1);
      const lineStop = Math.max(0, visualLen - nodeRadius);
      const lineEnd = {
        x: start.x + (visualDx / visualLen) * lineStop,
        y: start.y + (visualDy / visualLen) * lineStop,
      };
      const frontSegmentLength = Math.min(42, Math.max(18, lineStop * 0.22));
      const frontSegmentStart = {
        x:
          start.x +
          (visualDx / visualLen) * Math.max(0, lineStop - frontSegmentLength),
        y:
          start.y +
          (visualDy / visualLen) * Math.max(0, lineStop - frontSegmentLength),
      };
      const a = resolveThemeColor(
        (moveClass || { color: "var(--app-muted-soft)" }).color,
        "var(--app-muted-soft)",
      );
      const nodeLabel = displayEvalText(row.evalText || "0.0");
      const nodeTextFill = nodeLabelTextFill(a);
      const nodeTextStroke =
        nodeTextFill === resolveThemeColor("var(--app-text)")
          ? rgbaFromHex("var(--app-bg)", 0.45)
          : rgbaFromHex("var(--app-text)", 0.35);
      const nodeLabelClass = nodeLabel.startsWith("\u2212")
        ? "node-label node-label-negative"
        : "node-label";
      lineVisuals.push(
        `<line class="${animateDelta.trim()}" x1="${start.x}" y1="${start.y}" x2="${frontSegmentStart.x}" y2="${frontSegmentStart.y}" stroke="${a}" stroke-linecap="butt" stroke-width="${thick}" opacity="1"/>`,
      );
      nodeVisuals.push(
        `<line class="${animateDelta.trim()}" x1="${frontSegmentStart.x}" y1="${frontSegmentStart.y}" x2="${lineEnd.x}" y2="${lineEnd.y}" stroke="${a}" stroke-linecap="butt" stroke-width="${thick}" opacity="1"/>`,
      );
      nodeVisuals.push(
        `<g class="${animateDelta.trim()}" transform="translate(${end.x} ${end.y})"><circle r="${nodeRadius}" fill="${a}"></circle><text class="${nodeLabelClass}" fill="${nodeTextFill}" stroke="${nodeTextStroke}" text-anchor="middle" dominant-baseline="middle">${nodeLabel}</text></g>`,
      );
      hits.push(
        `<g><line data-uci="${row.bestUci}" data-hit="line" x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="transparent" stroke-linecap="round" stroke-width="${Math.max(thick + 18, 28)}"></line><circle data-uci="${row.bestUci}" data-hit="node" cx="${end.x}" cy="${end.y}" r="${radius + 10}" fill="transparent"></circle></g>`,
      );
    });

    ui.overlaySvg.innerHTML = `${lineDefs.length ? `<defs>${lineDefs.join("")}</defs>` : ""}${lineVisuals.join("")}`;
    ui.overlayNodeSvg.innerHTML = nodeVisuals.join("");
    ui.overlayHit.innerHTML = hits.join("");
    ui.overlayHit.style.pointerEvents = hits.length ? "auto" : "none";
    if (_overlayNeedsEntrance) animateOverlayEntrance();
  }

  function clearOverlayGhost() {
    clearTimeout(_overlayGhostTimer);
    ui.overlayGhostSvg.innerHTML = "";
    ui.overlayGhostNodeSvg.innerHTML = "";
    ui.overlayGhostSvg.classList.remove("fade-out");
    ui.overlayGhostNodeSvg.classList.remove("fade-out");
  }

  function preserveOverlayGhost() {
    const lineHtml = ui.overlaySvg.innerHTML;
    const nodeHtml = ui.overlayNodeSvg.innerHTML;
    if (!lineHtml && !nodeHtml) return;
    clearTimeout(_overlayGhostTimer);
    ui.overlayGhostSvg.classList.remove("fade-out");
    ui.overlayGhostNodeSvg.classList.remove("fade-out");
    ui.overlayGhostSvg.innerHTML = lineHtml;
    ui.overlayGhostNodeSvg.innerHTML = nodeHtml;
    requestAnimationFrame(() => {
      ui.overlayGhostSvg.classList.add("fade-out");
      ui.overlayGhostNodeSvg.classList.add("fade-out");
    });
    _overlayGhostTimer = setTimeout(() => {
      ui.overlayGhostSvg.innerHTML = "";
      ui.overlayGhostNodeSvg.innerHTML = "";
      ui.overlayGhostSvg.classList.remove("fade-out");
      ui.overlayGhostNodeSvg.classList.remove("fade-out");
    }, 220);
  }

  function animateOverlayEntrance() {
    _overlayNeedsEntrance = false;
    clearTimeout(_overlayEnterTimer);
    ui.overlaySvg.classList.remove("overlay-enter");
    ui.overlayNodeSvg.classList.remove("overlay-enter");
    void ui.overlaySvg.getBoundingClientRect();
    ui.overlaySvg.classList.add("overlay-enter");
    ui.overlayNodeSvg.classList.add("overlay-enter");
    _overlayEnterTimer = setTimeout(() => {
      ui.overlaySvg.classList.remove("overlay-enter");
      ui.overlayNodeSvg.classList.remove("overlay-enter");
    }, 220);
  }

  function renderAnalysisHoverOnly() {
    if (
      _hoveredAnalysisRowEl &&
      !ui.analysisList.contains(_hoveredAnalysisRowEl)
    )
      _hoveredAnalysisRowEl = null;
    const hoveredUci = state.hoveredUci || "";
    const selectorValue =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(hoveredUci)
        : hoveredUci.replace(/"/g, '\\"');
    const nextHoveredRow = hoveredUci
      ? ui.analysisList.querySelector(
          `.analysis-row[data-uci="${selectorValue}"]`,
        )
      : null;
    if (_hoveredAnalysisRowEl && _hoveredAnalysisRowEl !== nextHoveredRow)
      _hoveredAnalysisRowEl.classList.remove("hover");
    if (nextHoveredRow && nextHoveredRow !== _hoveredAnalysisRowEl)
      nextHoveredRow.classList.add("hover");
    _hoveredAnalysisRowEl = nextHoveredRow || null;
  }

  function displayEvalText(text) {
    const normalized = String(text || "0.0").replace(/^\+/, "");
    if (/^-\d+(?:\.\d+)?$/.test(normalized))
      return `\u2212${normalized.slice(1)}`;
    if (/^\d+(?:\.\d+)?$/.test(normalized)) return normalized;
    return normalized;
  }

  function resolveThemeColor(color, fallback = "var(--app-text)") {
    const candidate = String(color || "").trim();
    const source = candidate || fallback;
    if (!source.startsWith("var(")) return source;
    const match = source.match(/var\((--[^,\s)]+)/);
    if (!match) return source;
    const resolved = getComputedStyle(document.documentElement)
      .getPropertyValue(match[1])
      .trim();
    return resolved || source;
  }

  function rgbFromCssColor(color, fallback = "var(--app-text)") {
    const resolved = resolveThemeColor(color, fallback);
    const hex = resolved.replace("#", "");
    if (/^[0-9a-f]{6}$/i.test(hex)) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
    const rgbMatch = resolved.match(
      /rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/i,
    );
    if (rgbMatch) {
      return {
        r: Number(rgbMatch[1]) || 0,
        g: Number(rgbMatch[2]) || 0,
        b: Number(rgbMatch[3]) || 0,
      };
    }
    return {
      r: 255,
      g: 255,
      b: 255,
    };
  }

  function nodeLabelTextFill(fillHex) {
    const { r, g, b } = rgbFromCssColor(fillHex, "var(--app-text)");
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.58
      ? resolveThemeColor("var(--app-accent-contrast)", "var(--app-bg)")
      : resolveThemeColor("var(--app-text)");
  }

  function rgbaFromHex(hexColor, alpha) {
    const { r, g, b } = rgbFromCssColor(hexColor, "var(--app-accent)");
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function mixCssColors(colorA, colorB, weight = 0.5) {
    const left = rgbFromCssColor(colorA, "var(--app-text)");
    const right = rgbFromCssColor(colorB, "var(--app-accent)");
    const ratio = Math.max(0, Math.min(1, Number(weight) || 0));
    const inverse = 1 - ratio;
    return `rgb(${Math.round(left.r * inverse + right.r * ratio)},${Math.round(left.g * inverse + right.g * ratio)},${Math.round(left.b * inverse + right.b * ratio)})`;
  }

  function moveHighlightFill(moveClass, alpha) {
    return rgbaFromHex(moveClass?.color || "var(--app-accent)", alpha);
  }

  function joinLabels(labels) {
    const parts = (labels || []).filter(Boolean);
    if (!parts.length) return "";
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
    return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
  }

  function describeTacticalTarget(target) {
    if (!target?.square) return "";
    const type = String(target.type || "").trim().toLowerCase();
    const label = type === "k" ? "king" : pieceName(type || "piece");
    return `the ${label} on ${target.square}`;
  }

  function activeTacticalPreviewRow(game = currentGame()) {
    const rows = visibleAnalysisRows(game);
    if (!rows.length) return { row: null, rows: [], index: -1, activeUci: "" };
    const preferredUci = state.hoveredUci || rows[0]?.bestUci || "";
    const index = Math.max(
      0,
      rows.findIndex((candidate) => candidate.bestUci === preferredUci),
    );
    return {
      row: rows[index] || rows[0] || null,
      rows,
      index,
      activeUci: rows[index]?.bestUci || rows[0]?.bestUci || "",
    };
  }

  function tacticalSignalsForCurrentLine(game = currentGame()) {
    return [];
  }

  function looksLikeRawUci(text) {
    return /^[a-h][1-8][a-h][1-8][nbrq]?$/i.test(String(text || "").trim());
  }

  function firstSanForUci(fen, uci) {
    if (!fen || !uci) return "";
    const game = new Chess(fen);
    const fullmove = parseInt(game.fen().split(" ")[5], 10);
    const prefix = game.turn() === "w" ? `${fullmove}.` : `${fullmove}...`;
    let played = null;
    const parsed = parseUci(uci);
    if (parsed) {
      try {
        played = game.move({
          from: parsed.from,
          to: parsed.to,
          promotion: parsed.promotion || undefined,
        });
      } catch (_) {
        played = null;
      }
    }
    if (!played) {
      const legal = uciToLegalMove(game, uci);
      if (!legal) return "";
      played = game.move(legal);
    }
    return played ? `${prefix} ${played.san}` : "";
  }

  function analysisLeadText(row, fen = state.current?.fen || START_FEN) {
    if (row?.firstSan && !looksLikeRawUci(row.firstSan)) return row.firstSan;
    return (
      firstSanForUci(fen, row?.bestUci) || row?.firstSan || row?.bestUci || ""
    );
  }

  function renderAnalysisFull() {
    if (state.engineLinesHidden) {
      ui.analysisList.innerHTML = "";
      return;
    }
    if (state.awaitingImportedPgnAnalysis) {
      const progress = importedPgnAnalysisProgress();
      ui.analysisList.innerHTML = `<div class="empty" aria-label="Stockfish analyzing imported game"><div class="loading-dots" aria-hidden="true"><span></span><span></span><span></span></div><div class="empty-copy">Analyzing imported game ${escapeHtml(`${progress.complete}/${progress.total || 0} moves`)}</div></div>`;
      return;
    }
    const game = currentGame();
    const terminal = terminalPositionInfo(game);
    const focusMoves = selectedLegalMoves(game);
    if (
      state.awaitingFinalAnalysis &&
      !terminal &&
      (!state.selectedSquare || focusMoves.length)
    ) {
      ui.analysisList.innerHTML = `<div class="empty" aria-label="Engine loading"><div class="loading-dots" aria-hidden="true"><span></span><span></span><span></span></div></div>`;
      return;
    }
    const panelRows = panelAnalysisRows(game);
    const visibleRows = panelRows.map((item) => item.row);
    const baseFen = state.current?.fen || "";
    const maxLeadCols = Math.max(
      6,
      ...visibleRows.map((row) =>
        Array.from(analysisLeadText(row, state.current.fen)).length,
      ),
    );
    if (!visibleRows.length) {
      ui.analysisList.innerHTML = terminal
        ? `<div class="empty"><div class="empty-title">${escapeHtml(terminal.title)}</div><div class="empty-copy">${escapeHtml(terminal.message)}</div></div>`
        : state.selectedSquare
          ? focusMoves.length
            ? `<div class="empty" aria-label="Engine loading"><div class="loading-dots" aria-hidden="true"><span></span><span></span><span></span></div></div>`
            : `<div class="empty">No legal moves are available from ${escapeHtml(state.selectedSquare)}.</div>`
          : `<div class="empty" aria-label="Engine loading"><div class="loading-dots" aria-hidden="true"><span></span><span></span><span></span></div></div>`;
      return;
    }
    const maxRankCols = Math.max(2, String(panelRows.length).length + 1);
    ui.analysisList.innerHTML = panelRows
      .map(({ row, blurred }, index) => {
        const active = state.hoveredUci === row.bestUci ? " hover" : "";
        const blurClass = blurred ? " blurred" : "";
        const lead = analysisLeadText(row, state.current.fen);
        const pv = row.restSan || "";
        const stats = `${row.evalText} · d${row.depth || "-"} · ${formatNodes(row.nodes)}`;
        const moveClass = classifyDisplayedMove(row, index, visibleRows, game);
        const visualClass = moveClass || {
          color: "var(--app-muted-soft)",
          soft: "var(--app-surface-subtle)",
          border: "var(--app-border)",
        };
        const classBadge = moveClass
          ? `<span class="analysis-class" title="${escapeHtml(moveClass.label)}"><img class="analysis-class-icon" src="${escapeHtml(moveClass.icon || "")}" alt="${escapeHtml(moveClass.label)} icon"><span>${escapeHtml(moveClass.label)}</span></span>`
          : '<span class="analysis-class" aria-hidden="true" style="visibility:hidden"></span>';
        return `<div class="analysis-row${active}${blurClass}" data-uci="${row.bestUci}" tabindex="0" style="--accent:${visualClass.color};--accent-soft:${visualClass.soft};--border:${visualClass.border};--lead-cols:${maxLeadCols};--rank-cols:${maxRankCols}"><div class="analysis-main"><span class="analysis-rank">#${index + 1}</span><strong class="analysis-san">${escapeHtml(lead)}</strong><span class="analysis-badges">${classBadge}</span><span class="analysis-stats">${escapeHtml(stats)}</span></div><div class="analysis-pv${pv ? "" : " dim"}">${escapeHtml(pv || lead)}</div></div>`;
      })
      .join("");
  }

  function patternThemeColor(theme) {
    const key = String(theme || "").trim();
    return PATTERN_THEME_COLORS[key] || "var(--app-muted-soft)";
  }

  function patternThemeScore(themeRow) {
    const raw = Number(
      themeRow?.finalScore ??
      themeRow?.learnedScore ??
      themeRow?.score,
    );
    return Number.isFinite(raw) ? raw : 0;
  }

  function renderPatternDetectionError(message) {
    if (!ui.themeAnalysisMeta || !ui.themeAnalysisList) return;
    ui.themeAnalysisMeta.textContent = String(message || "Signals unavailable");
    ui.themeAnalysisMeta.style.color = "#f44";
    ui.themeAnalysisList.innerHTML =
      '<span class="theme-analysis-empty">Tactical signals are unavailable right now.</span>';
  }

  function renderPatternDetectionResult(signals) {
    if (!ui.themeAnalysisMeta || !ui.themeAnalysisList) return;
    ui.themeAnalysisMeta.style.color = "";
    if (!signals.length) {
      ui.themeAnalysisMeta.textContent = "Quiet line";
      ui.themeAnalysisList.innerHTML =
        '<span class="theme-analysis-empty">No active tactical signals for the current line.</span>';
      return;
    }
    ui.themeAnalysisMeta.textContent = `${signals.length} active signal${signals.length === 1 ? "" : "s"}`;
    ui.themeAnalysisList.innerHTML = signals
      .map(
        (signal) => `<article class="tactical-signal-card" style="--signal-color:${escapeHtml(patternThemeColor(signal.kind || "fork"))}">
          <div class="tactical-signal-head">
            <span class="tactical-signal-kicker">Active overlay</span>
            <span class="fork-badge" title="${escapeHtml(signal.badgeTitle || signal.badgeLabel || "")}">
              <img class="fork-badge-icon" src="${escapeHtml(FORK_ICON_URL)}" alt="">
              <span>${escapeHtml(signal.badgeLabel || "Fork")}</span>
            </span>
          </div>
          <div class="tactical-signal-title">${escapeHtml(signal.title || "")}</div>
          <div class="tactical-signal-copy">${escapeHtml(signal.summary || "")} ${escapeHtml(signal.details || "")}</div>
        </article>`,
      )
      .join("");
  }

  function schedulePatternDetection(force = false) {
    if (!ui.themeAnalysisMeta || !ui.themeAnalysisList) return;
    const game = currentGame();
    const fen = state.current?.fen || "";
    const activeUci = state.hoveredUci || visibleAnalysisRows(game)[0]?.bestUci || "";
    const nextKey = `${fen}|${activeUci}|${state.engineLinesHidden ? "hidden" : "shown"}`;
    if (!force && nextKey === _themeDetectionFen) return;
    _themeDetectionFen = nextKey;
    try {
      renderPatternDetectionResult(tacticalSignalsForCurrentLine(game));
    } catch (error) {
      renderPatternDetectionError(error?.message || String(error));
    }
  }

  function importedReviewMoveKey(parentFen, moveUci) {
    const fen = String(parentFen || "").trim();
    const uci = String(moveUci || "").trim();
    if (!fen || !uci) return "";
    return `${fen}|${uci}`;
  }

  function importedReviewCommentForNode(node) {
    if (!node?.parent?.fen || !node?.uci) return "";
    const key = importedReviewMoveKey(node.parent.fen, node.uci);
    const entry = state.importedGameReviewComments.get(key);
    if (!entry) return "";
    return String(entry.comment || "").trim();
  }

  function stopImportedReviewTypewriter() {
    if (state.importedGameReviewTypewriterTimer) {
      clearTimeout(state.importedGameReviewTypewriterTimer);
      state.importedGameReviewTypewriterTimer = null;
    }
  }

  function stopImportedReviewThinkingAnimation() {
    if (state.importedGameReviewThinkingTimer) {
      clearTimeout(state.importedGameReviewThinkingTimer);
      state.importedGameReviewThinkingTimer = null;
    }
    state.importedGameReviewThinkingDots = 0;
  }

  function setImportedReviewMessageImmediate(text, extraClass) {
    state.llmMessages = [
      {
        role: "assistant",
        content: text,
        extraClass: extraClass || "auto-coach",
      },
    ];
    state.importedGameReviewTypewriterText = String(text || "");
  }

  function startImportedReviewTypewriter(nodeId, fullText) {
    const targetNodeId = String(nodeId || "");
    const text = String(fullText || "").trim();
    stopImportedReviewThinkingAnimation();
    stopImportedReviewTypewriter();
    state.importedGameReviewLastNodeId = targetNodeId;
    state.importedGameReviewLastText = text;
    state.importedGameReviewTypewriterText = "";
    state.llmMessages = [
      {
        role: "assistant",
        content: "",
        extraClass: "auto-coach",
      },
    ];

    let index = 0;
    const tick = () => {
      const step = Math.max(1, Math.min(4, Math.floor(text.length / 55) + 1));
      index = Math.min(text.length, index + step);
      state.importedGameReviewTypewriterText = text.slice(0, index);
      if (state.llmMessages[0]) state.llmMessages[0].content = state.importedGameReviewTypewriterText;
      renderAssistant();
      if (index < text.length) {
        state.importedGameReviewTypewriterTimer = setTimeout(tick, 20);
      } else {
        state.importedGameReviewTypewriterTimer = null;
      }
    };
    tick();
  }

  function startImportedReviewThinkingAnimation() {
    stopImportedReviewTypewriter();
    stopImportedReviewThinkingAnimation();
    const base = "Reviewing this move";
    const tick = () => {
      state.importedGameReviewThinkingDots =
        (state.importedGameReviewThinkingDots + 1) % 4;
      const suffix = ".".repeat(state.importedGameReviewThinkingDots);
      setImportedReviewMessageImmediate(`${base}${suffix}`, "auto-coach");
      state.importedGameReviewThinkingTimer = setTimeout(tick, 360);
      // Register the timer before rendering to avoid sync re-entry loops.
      renderAssistant();
    };
    tick();
  }

  function syncImportedReviewCoachMessage(force = false) {
    if (!state.importedGameReviewMode) return;
    const node = currentDisplayNode() || state.current;
    if (!node || !node.parent || !node.uci) {
      stopImportedReviewTypewriter();
      stopImportedReviewThinkingAnimation();
      setImportedReviewMessageImmediate(
        "Import a PGN game to start move-by-move coach review.",
        "auto-coach",
      );
      return;
    }

    const comment = importedReviewCommentForNode(node);
    if (!comment) {
      if (state.importedGameReviewLoading) {
        if (!state.importedGameReviewThinkingTimer) {
          startImportedReviewThinkingAnimation();
        }
      } else {
        stopImportedReviewTypewriter();
        stopImportedReviewThinkingAnimation();
        state.llmMessages = [];
        state.importedGameReviewTypewriterText = "";
      }
      return;
    }

    if (
      !force &&
      state.importedGameReviewLastNodeId === node.id &&
      state.importedGameReviewLastText === comment
    ) {
      return;
    }

    startImportedReviewTypewriter(node.id, comment);
  }

  function reportIdentityForColor(color) {
    const isWhite = color === "white";
    const importedName = isWhite
      ? state.importedWhitePlayerName
      : state.importedBlackPlayerName;
    const importedRating = isWhite
      ? state.importedWhitePlayerRating
      : state.importedBlackPlayerRating;
    const liveName = isWhite ? state.whitePlayerName : state.blackPlayerName;
    const liveRating = isWhite ? state.whitePlayerRating : state.blackPlayerRating;
    const arcadeIdentity = arcadeDisplayIdentityForColor(color);
    return {
      name:
        arcadeIdentity?.name ||
        (liveName === (isWhite ? "White" : "Black") && importedName
          ? importedName
          : liveName),
      rating: arcadeIdentity?.rating || liveRating || importedRating || "",
    };
  }

  function moverColorForNode(node) {
    const turn = String(node?.parent?.fen || "").split(" ")[1] || "w";
    return turn === "w" ? "white" : "black";
  }

  function reportMoveClassScore(moveClass) {
    if (moveClass === MOVE_CLASS_STYLES.brilliant) return 100;
    if (moveClass === MOVE_CLASS_STYLES.critical) return 98;
    if (moveClass === MOVE_CLASS_STYLES.best) return 96;
    if (moveClass === MOVE_CLASS_STYLES.excellent) return 91;
    if (moveClass === MOVE_CLASS_STYLES.okay) return 78;
    if (moveClass === MOVE_CLASS_STYLES.inaccuracy) return 58;
    if (moveClass === MOVE_CLASS_STYLES.mistake) return 32;
    if (moveClass === MOVE_CLASS_STYLES.blunder) return 0;
    return 72;
  }

  // Estimated ELO from analysis metrics.
  // Based on multi-feature regression research:
  // - ACPL (average centipawn loss) is the primary predictor
  // - Accuracy % (move quality) adds signal
  // - Blunder rate (moves ≥1.0 pawn loss) is highly predictive
  function estimateEloFromStats(stats) {
    if (!stats || stats.totalMoves < 5) return null;
    const { accuracy, counts, totalMoves } = stats;

    // Average centipawn loss per move classification
    // Weighted by frequency of each class
    const avgCpLossPerClass = {
      brilliant: 5,
      critical: 15,
      best: 10,
      excellent: 25,
      okay: 60,
      inaccuracy: 140,
      mistake: 260,
      blunder: 450,
    };
    let totalCpLoss = 0;
    let moveCount = 0;
    for (const [key, count] of Object.entries(counts)) {
      if (avgCpLossPerClass[key] != null && count > 0) {
        totalCpLoss += avgCpLossPerClass[key] * count;
        moveCount += count;
      }
    }
    if (moveCount === 0) return null;
    const acpl = totalCpLoss / moveCount;

    // Blunder and mistake rates
    const blunderRate = (counts.blunder || 0) / totalMoves;
    const mistakeRate = (counts.mistake || 0) / totalMoves;
    const inaccuracyRate = (counts.inaccuracy || 0) / totalMoves;
    const goodRate = (stats.goodMoves || 0) / totalMoves;

    // Primary formula: exponential decay from ACPL
    // Calibrated so ~1500 at 75 ACPL, ~2000 at 30 ACPL, ~2500 at 10 ACPL
    let elo = 2850 * Math.exp(-0.0065 * acpl);

    // Adjust down for high blunder rate (each 10% blunder rate ≈ -80 Elo)
    elo -= blunderRate * 800;

    // Adjust for accuracy (each 10% below 90% accuracy ≈ -50 Elo)
    if (accuracy != null && accuracy < 90) {
      elo -= (90 - accuracy) * 5;
    }

    // Clamp to reasonable range
    return Math.round(Math.max(0, Math.min(3000, elo)));
  }

  function initialReportPlayerStats(color) {
    return {
      color,
      ...reportIdentityForColor(color),
      totalMoves: 0,
      goodMoves: 0,
      badMoves: 0,
      accuracyTotal: 0,
      accuracy: null,
      estimatedElo: null,
      counts: {
        brilliant: 0,
        critical: 0,
        best: 0,
        excellent: 0,
        okay: 0,
        inaccuracy: 0,
        mistake: 0,
        blunder: 0,
      },
      firstNodeIds: {
        brilliant: "",
        critical: "",
        best: "",
        excellent: "",
        okay: "",
        inaccuracy: "",
        mistake: "",
        blunder: "",
      },
    };
  }

  function reportOutcomeInfo(game = currentGame()) {
    const pathLength = Math.max(0, currentPath().length - 1);
    const openingLabel = state.openingInfo?.name
      ? `${state.openingInfo.eco ? `${state.openingInfo.eco} ` : ""}${state.openingInfo.name}`
      : "";
    if (game?.in_checkmate?.()) {
      const winnerColor = game.turn() === "w" ? "black" : "white";
      return {
        label: "Checkmate",
        detail: `${winnerColor === "white" ? "White" : "Black"} delivered mate.`,
        result: winnerColor === "white" ? "1-0" : "0-1",
        winnerColor,
        openingLabel,
      };
    }
    if (game?.in_stalemate?.()) {
      return {
        label: "Stalemate",
        detail: "No legal moves remain.",
        result: "1/2-1/2",
        winnerColor: "",
        openingLabel,
      };
    }
    if (game?.game_over?.()) {
      return {
        label: "Game Over",
        detail: "This line has reached a terminal result.",
        result: "1/2-1/2",
        winnerColor: "",
        openingLabel,
      };
    }
    const sideToMove = currentTurnColor(game) === "black" ? "Black to move" : "White to move";
    return {
      label: sideToMove,
      detail: openingLabel || "",
      result: "Ready",
      winnerColor: "",
      openingLabel,
    };
  }

  function collectAnalysisReport() {
    const game = currentGame();
    const nodes = currentMoveNodes();
    const white = initialReportPlayerStats("white");
    const black = initialReportPlayerStats("black");
    const goodKeys = new Set(["brilliant", "critical", "best", "excellent", "okay"]);
    const badKeys = new Set(["inaccuracy", "mistake", "blunder"]);
    nodes.forEach((node) => {
      const color = moverColorForNode(node);
      const stats = color === "white" ? white : black;
      const moveClass = classificationForHistoryNode(node);
      const moveClassKey = moveClassKeyForStyle(moveClass) || "";
      stats.totalMoves += 1;
      stats.accuracyTotal += reportMoveClassScore(moveClass);
      if (moveClassKey && Object.prototype.hasOwnProperty.call(stats.counts, moveClassKey)) {
        stats.counts[moveClassKey] += 1;
        if (!stats.firstNodeIds[moveClassKey]) stats.firstNodeIds[moveClassKey] = node.id;
      }
      if (goodKeys.has(moveClassKey)) stats.goodMoves += 1;
      if (badKeys.has(moveClassKey)) stats.badMoves += 1;
    });
    [white, black].forEach((stats) => {
      stats.accuracy = stats.totalMoves
        ? Number((stats.accuracyTotal / stats.totalMoves).toFixed(1))
        : null;
      stats.estimatedElo = estimateEloFromStats(stats);
    });
    return {
      game,
      nodes,
      white,
      black,
      hasMoveData: nodes.length > 0,
      outcome: reportOutcomeInfo(game),
    };
  }

  function reportCountCellMarkup(stats, moveClassKey) {
    const count = stats.counts[moveClassKey] || 0;
    if (!count) return '<span class="report-class-count is-empty">0</span>';
    const nodeId = stats.firstNodeIds[moveClassKey] || "";
    return `<button type="button" class="report-class-count" data-report-node-id="${escapeHtml(nodeId)}">${escapeHtml(String(count))}</button>`;
  }

  function renderReportPlayerSummaryCard(stats, sideLabel, goodShare, winnerColor) {
    const isWinner = winnerColor === stats.color;
    const accuracyText =
      stats.accuracy == null ? "--" : `${escapeHtml(stats.accuracy.toFixed(1))}%`;
    const estimatedEloText =
      stats.estimatedElo != null ? String(stats.estimatedElo) : null;
    return `
      <section class="report-player-summary ${escapeHtml(stats.color)}${isWinner ? " is-winner" : ""}">
        <div class="report-player-summary-head">
          <div class="report-player-name-row">
            <span class="report-player-name">${escapeHtml(stats.name || sideLabel)}</span>
          </div>
          <div class="report-player-side">${escapeHtml(sideLabel)}</div>
        </div>
        <div class="report-player-stat-grid">
          <div class="report-player-stat">
            <div class="report-player-stat-label">Accuracy</div>
            <div class="report-metric-value">${accuracyText}</div>
            <div class="report-mini-bar">
              <span class="report-mini-bar-good" style="width:${Math.max(0, Math.min(100, goodShare)).toFixed(1)}%"></span>
              <span class="report-mini-bar-bad" style="width:${Math.max(0, Math.min(100, 100 - goodShare)).toFixed(1)}%"></span>
            </div>
            <div class="report-mini-counts"><span>${escapeHtml(String(stats.goodMoves))}</span><span>${escapeHtml(String(stats.badMoves))}</span></div>
          </div>
          <div class="report-player-stat compact">
            <div class="report-player-stat-label">ELO</div>
            <div class="report-metric-value">${estimatedEloText ? escapeHtml(estimatedEloText) : escapeHtml(stats.rating || "--")}</div>
          </div>
        </div>
      </section>
    `;
  }

  function renderReportPlayerClassificationCard(stats, sideLabel, moveClassKeys) {
    return `
      <section class="report-category-card player-breakdown ${escapeHtml(stats.color)}">
        <div class="report-category-head">
          <div class="report-category-title-wrap">
            <span class="report-category-dot" aria-hidden="true"></span>
            <h4>${escapeHtml(stats.name || sideLabel)}</h4>
          </div>
          <span class="report-player-side">${escapeHtml(sideLabel)}</span>
        </div>
        <div class="report-category-body">
          ${moveClassKeys
            .map((moveClassKey) => {
              const style = MOVE_CLASS_STYLES[moveClassKey];
              if (!style) return "";
              return `
                <div class="report-class-row" style="--report-class-color:${escapeHtml(style.color)}">
                  <div class="report-class-label">
                    <img class="report-class-icon" src="${escapeHtml(style.icon)}" alt="">
                    <span>${escapeHtml(style.label)}</span>
                  </div>
                  <div class="report-class-counts solo">
                    ${reportCountCellMarkup(stats, moveClassKey)}
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      </section>
    `;
  }
  function renderAnalysisReport() {
    if (!ui.reportOverview || !ui.assistantMessages) return;
    syncReportVisibility(true);
    const report = collectAnalysisReport();
    const whiteGoodShare =
      report.white.goodMoves + report.white.badMoves > 0
        ? (report.white.goodMoves / (report.white.goodMoves + report.white.badMoves)) * 100
        : 100;
    const blackGoodShare =
      report.black.goodMoves + report.black.badMoves > 0
        ? (report.black.goodMoves / (report.black.goodMoves + report.black.badMoves)) * 100
        : 100;
    if (ui.evalChartMeta) ui.evalChartMeta.textContent = "";
    ui.reportOverview.innerHTML = `
      <div class="report-overview-shell">
        <div class="report-player-columns">
          ${renderReportPlayerSummaryCard(report.white, "White", whiteGoodShare, report.outcome.winnerColor)}
          ${renderReportPlayerSummaryCard(report.black, "Black", blackGoodShare, report.outcome.winnerColor)}
        </div>
      </div>
    `;
    ui.assistantMessages.style.display = "grid";
    ui.assistantMessages.innerHTML = [
      renderReportPlayerClassificationCard(report.white, "White", ["brilliant", "critical", "best", "excellent", "okay", "inaccuracy", "mistake", "blunder"]),
      renderReportPlayerClassificationCard(report.black, "Black", ["brilliant", "critical", "best", "excellent", "okay", "inaccuracy", "mistake", "blunder"]),
    ].join("");
  }

  function renderAssistant() {
    const showReport = reportRailVisible();
    syncReportVisibility(showReport || isArcadeMode());
    if (!isArcadeMode() && !showReport) return;
    if (ui.sendBtn) {
      ui.sendBtn.disabled = true;
      ui.sendBtn.textContent = state.llmWaiting ? "Thinking..." : "Send";
      ui.sendBtn.classList.toggle("loading", state.llmWaiting);
    }
    ui.coachCard.classList.toggle(
      "waiting",
      state.llmWaiting || state.importedGameReviewLoading,
    );
    ui.coachCard.classList.remove("no-messages");
    if (ui.coachPill) {
      ui.coachPill.classList.toggle(
        "waiting",
        state.llmWaiting || state.importedGameReviewLoading,
      );
      ui.coachPill.style.display = "none";
    }

    if (isArcadeMode()) {
      const variant = currentArcadeVariant();
      const statusCopy = state.arcadeThinking
        ? variant.mode === "weirdhorse"
          ? "The opponent is evaluating the current horse law before it moves."
          : variant.mode === "maia-drift"
            ? `The opponent is choosing a move from its current drift profile. Test Elo: ${state.arcadeHiddenElo}.`
            : "The opponent is thinking in a straight standard game."
        : currentTurnColor() === variant.playerColor
          ? variant.mode === "weirdhorse"
            ? `Current horse law: ${currentWeirdhorseProfile().label}. It reshuffles in ${pliesUntilNextWeirdhorseShuffle()} plies.`
            : variant.mode === "maia-drift"
              ? `Make your move. The opponent will drift again right before it replies. Test Elo: ${state.arcadeHiddenElo}.`
              : "Make your move. This is a straight standard-rules game."
          : variant.mode === "weirdhorse"
            ? "The opponent is about to move under the current horse law."
            : "The opponent is about to move.";
      if (ui.evalChartMeta) ui.evalChartMeta.textContent = state.arcadeThinking ? "Opponent thinking" : "Arcade";
      if (ui.reportOverview) {
        ui.reportOverview.innerHTML = `
          <div class="report-overview-shell arcade-report-shell">
            <div class="report-summary-banner">
              <div>
                <div class="report-kicker">Arcade status</div>
                <div class="report-summary-copy">${escapeHtml(variant.description)}</div>
              </div>
              <div class="report-status-pill">${escapeHtml(variant.title)}</div>
            </div>
            <div class="report-summary-copy">${escapeHtml(statusCopy)}</div>
          </div>
        `;
      }
      ui.assistantMessages.style.display = "grid";
      ui.assistantMessages.innerHTML = `
        <section class="report-category-card good">
          <div class="report-category-head">
            <div class="report-category-title-wrap">
              <span class="report-category-dot" aria-hidden="true"></span>
              <h4>Arcade modes</h4>
            </div>
          </div>
          <div class="report-category-body arcade-mode-grid">
            ${Object.values(ARCADE_VARIANTS)
              .map(
                (entry) => `
                  <button
                    type="button"
                    class="btn ${entry.key === state.arcadeVariantKey ? "primary" : "subtle"}"
                    data-arcade-variant="${escapeHtml(entry.key)}"
                    style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-height:64px;text-align:left"
                  >
                    <span>${escapeHtml(entry.label)}</span>
                    <span style="font-size:11px;opacity:.74">${escapeHtml(entry.mode === "weirdhorse" ? "Custom horse law" : entry.mode === "maia-drift" ? "Visible test drift" : "Set your strength")}</span>
                  </button>
                `,
              )
              .join("")}
          </div>
        </section>
      `;
      return;
    }

    renderAnalysisReport();
  }

  function renderDragPiece() {
    if (!state.dragState?.dragging) {
      ui.dragLayer.innerHTML = "";
      return;
    }
    const rect =
      state.dragState.boardRect || ui.boardGrid.getBoundingClientRect();
    const x = state.dragState.clientX - rect.left;
    const y = state.dragState.clientY - rect.top;
    let dragPiece = ui.dragLayer.firstElementChild;
    if (
      !(dragPiece instanceof HTMLElement) ||
      dragPiece.dataset.asset !== state.dragState.asset
    ) {
      ui.dragLayer.innerHTML = `<div class="drag-piece" data-asset="${escapeHtml(state.dragState.asset)}"><img src="${escapeHtml(state.dragState.asset)}" alt=""></div>`;
      dragPiece = ui.dragLayer.firstElementChild;
    }
    if (dragPiece instanceof HTMLElement) {
      dragPiece.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    }
  }

  function visibleAnalysisRows(game = currentGame()) {
    const fen = state.current?.fen || game?.fen?.() || "";
    const legalUcis = legalUciSetForGame(game);
    const legalRows = normalizeAnalysisRows(
      state.analysisRows.filter(
        (row) => row?.bestUci && legalUcis.has(row.bestUci),
      ),
      fen,
    );
    if (!legalRows.length) return [];
    if (state.selectedSquare) {
      return legalRows.slice(0, activeAnalysisLimit(game));
    }
    const recommendableRows = legalRows.filter((row, index) => {
      const moveClass = classifyAnalysisMove(row, index, legalRows, game);
      return isRecommendableMoveClass(moveClass);
    });
    const rows = recommendableRows.length
      ? recommendableRows
      : legalRows.slice(0, 1);
    return rows.slice(0, activeAnalysisLimit(game));
  }

  function panelAnalysisRows(game = currentGame()) {
    const fen = state.current?.fen || game?.fen?.() || "";
    const legalUcis = legalUciSetForGame(game);
    const legalRows = normalizeAnalysisRows(
      state.analysisRows.filter(
        (row) => row?.bestUci && legalUcis.has(row.bestUci),
      ),
      fen,
    );
    if (!legalRows.length) return [];
    const limitedRows = legalRows.slice(0, activeAnalysisLimit(game));
    if (state.selectedSquare) {
      return limitedRows.map((row) => ({ row, blurred: false }));
    }
    return limitedRows.map((row, index) => {
      const moveClass = classifyAnalysisMove(row, index, legalRows, game);
      return {
        row,
        blurred: !isRecommendableMoveClass(moveClass),
      };
    });
  }

  function analysisRowsForFen(fen) {
    if (!fen) return [];
    if (state.current?.fen === fen && state.analysisRows.length)
      return state.analysisRows;
    const positionEntry = state.positionAnalysisCache.get(fen);
    if (positionEntry?.rows?.length) return positionEntry.rows;
    const nextPlyEntry = state.nextPlyAnalysisCache.get(fen);
    if (nextPlyEntry?.rows?.length) return nextPlyEntry.rows;
    return [];
  }

  function expectedLineCountForFen(fen) {
    if (!fen) return state.linesShown;
    if (_legalMoveCountCache.has(fen)) {
      const legalCount = _legalMoveCountCache.get(fen);
      return Math.max(
        1,
        Math.min(state.linesShown, legalCount || state.linesShown),
      );
    }
    try {
      const game = readOnlyGameForFen(fen);
      if (!game) return state.linesShown;
      const legalCount = game.moves().length;
      _legalMoveCountCache.delete(fen);
      _legalMoveCountCache.set(fen, legalCount);
      trimCacheMap(_legalMoveCountCache, 500);
      return Math.max(
        1,
        Math.min(state.linesShown, legalCount || state.linesShown),
      );
    } catch (_) {
      return state.linesShown;
    }
  }

  function cachedPositionHasEnoughRows(entry, fen) {
    return !!entry && (entry.rows?.length || 0) >= expectedLineCountForFen(fen);
  }

  function cachedEntryMeetsCurrentSearchTarget(entry) {
    if (!entry?.rows?.length) return false;
    if (state.limitKind === "depth")
      return (entry.publishedDepth || 0) >= state.limitValue;
    return true;
  }

  function cachedPositionIsReusable(entry, fen) {
    return (
      cachedPositionHasEnoughRows(entry, fen) &&
      cachedEntryMeetsCurrentSearchTarget(entry)
    );
  }

  function playedMoveEntryMeetsCurrentSearchTarget(entry) {
    if (!entry?.complete) return false;
    if (state.limitKind === "depth")
      return (entry.publishedDepth || 0) >= state.limitValue;
    return true;
  }

  function legalMovesForFen(fen, selectedSquare = "") {
    const weirdhorseKey =
      isWeirdhorseVariant() && fen === (state.current?.fen || "")
        ? `|horse:${currentWeirdhorseProfile().key}`
        : "";
    const key = `${fen}|${selectedSquare}${weirdhorseKey}`;
    if (_legalMovesForFenCache.has(key)) return _legalMovesForFenCache.get(key);
    if (!fen) return [];
    try {
      const game = new Chess(fen);
      const moves = weirdhorseLegalMoves(game, selectedSquare);
      if (_legalMovesForFenCache.size > 500) {
        const oldest = _legalMovesForFenCache.keys().next();
        if (!oldest.done) _legalMovesForFenCache.delete(oldest.value);
      }
      _legalMovesForFenCache.set(key, moves);
      return moves;
    } catch (_) {
      return [];
    }
  }

  function legalUciSetForFen(fen, selectedSquare = "") {
    const weirdhorseKey =
      isWeirdhorseVariant() && fen === (state.current?.fen || "")
        ? `|horse:${currentWeirdhorseProfile().key}`
        : "";
    const key = `${fen}|${selectedSquare}${weirdhorseKey}`;
    if (_legalUciSetForFenCache.has(key))
      return _legalUciSetForFenCache.get(key);
    const legalUcis = new Set(
      legalMovesForFen(fen, selectedSquare).map(
        (move) => move.from + move.to + (move.promotion || ""),
      ),
    );
    if (_legalUciSetForFenCache.size > 500) {
      const oldest = _legalUciSetForFenCache.keys().next();
      if (!oldest.done) _legalUciSetForFenCache.delete(oldest.value);
    }
    _legalUciSetForFenCache.set(key, legalUcis);
    return legalUcis;
  }

  function sanitizeAnalysisRows(rows, fen, selectedSquare = "") {
    const legalUcis = legalUciSetForFen(fen, selectedSquare);
    if (!rows?.length || !legalUcis.size) return [];
    return normalizeAnalysisRows(
      rows.filter((row) => row?.bestUci && legalUcis.has(row.bestUci)),
    );
  }

  function analysisVersionForFen(fen) {
    if (!fen) return "none";
    if (
      fen === state.current?.fen &&
      !state.selectedSquare &&
      state.analysisRows.length
    ) {
      return `live:${state.analysisPublishedAt}:${state.analysisPublishedDepth}:${state.analysisRows.length}`;
    }
    const positionEntry =
      state.positionAnalysisCache.get(fen) || matchingCachedFullAnalysisForFen(fen);
    if (positionEntry?.rows?.length) {
      return `pos:${positionEntry.publishedAt}:${positionEntry.publishedDepth}:${positionEntry.rows.length}`;
    }
    const nextPlyEntry = state.nextPlyAnalysisCache.get(fen);
    if (nextPlyEntry?.rows?.length) {
      return `next:${nextPlyEntry.publishedAt}:${nextPlyEntry.publishedDepth}:${nextPlyEntry.rows.length}`;
    }
    return "none";
  }

  function rebuildAnalysisByUci() {
    analysisByUci.clear();
    for (const row of state.analysisMap.values()) {
      if (row?.bestUci) analysisByUci.set(row.bestUci, row);
    }
  }

  function moveClassKeyForStyle(moveClass) {
    if (!moveClass) return "";
    for (const [key, style] of Object.entries(MOVE_CLASS_STYLES)) {
      if (style === moveClass) return key;
    }
    return "";
  }

  function moveClassStyleForKey(key) {
    return MOVE_CLASS_STYLES[String(key || "").toLowerCase()] || null;
  }

  function analysisDisplayClassCacheKey(fen, uci) {
    if (!fen || !uci) return "";
    return `${fen}|${uci}`;
  }

  function analysisDisplayClassCanSettle(game = currentGame()) {
    const fen = state.current?.fen || game?.fen?.() || "";
    if (!fen || fen !== state.current?.fen) return false;
    if (state.engineMode !== "analysis") return false;
    return Boolean(
      state.engineBusy || state.pendingSearch || state.awaitingFinalAnalysis,
    );
  }

  function classificationForUciInRows(uci, rows, game) {
    if (!uci) return null;
    const rowIndex = rows.findIndex((row) => row.bestUci === uci);
    if (rowIndex >= 0)
      return classifyAnalysisMove(rows[rowIndex], rowIndex, rows, game);
    return null;
  }

  function pieceAnalysisRowsForFenAndSquare(fen, square) {
    if (!fen || !square) return [];
    const entry = getFenPieceCache(fen).get(square);
    if (!entry?.rows?.length) return [];
    return sanitizeAnalysisRows(entry.rows, fen, square);
  }

  function pieceAnalysisVersionForFenAndSquare(fen, square) {
    if (!fen || !square) return "none";
    const entry = getFenPieceCache(fen).get(square);
    if (!entry?.rows?.length) return "none";
    return `${entry.publishedAt || 0}:${entry.publishedDepth || 0}:${entry.passMs || 0}:${entry.rows.length}`;
  }
  function playedMoveAnalysisEntryKey(fen, uci) {
    return `${String(fen || "")}|${String(uci || "")}`;
  }

  function playedMoveAnalysisEntryForFenAndUci(fen, uci) {
    if (!fen || !uci) return null;
    return (
      state.playedMoveAnalysisCache.get(playedMoveAnalysisEntryKey(fen, uci)) ||
      null
    );
  }

  function playedMoveAnalysisVersionForFenAndUci(fen, uci) {
    const entry = playedMoveAnalysisEntryForFenAndUci(fen, uci);
    if (!entry?.complete) return "none";
    return `${entry.publishedAt || 0}:${entry.publishedDepth || 0}:${entry.passMs || 0}:${entry.row?.bestUci || "searched"}`;
  }

  function classificationForFenAndUci(
    fen,
    uci,
    game = readOnlyGameForFen(fen),
  ) {
    if (!fen || !uci || !game) return null;
    const fullRows = fullPositionRowsForFen(fen);
    const direct = classificationForUciInRows(uci, fullRows, game);
    if (direct) return direct;
    const playedMoveRow =
      playedMoveAnalysisEntryForFenAndUci(fen, uci)?.row || null;
    const parsed = parseUci(uci);
    const pieceRows = parsed?.from
      ? pieceAnalysisRowsForFenAndSquare(fen, parsed.from)
      : [];
    if (playedMoveRow && fullRows.length)
      return classifyAnalysisMoveAgainstReference(
        playedMoveRow,
        fullRows,
        game,
      );
    if (playedMoveRow && pieceRows.length)
      return classifyAnalysisMoveAgainstReference(
        playedMoveRow,
        pieceRows,
        game,
      );
    if (!parsed?.from) return null;
    const candidateRow = pieceRows.find((row) => row.bestUci === uci) || null;
    if (candidateRow && fullRows.length)
      return classifyAnalysisMoveAgainstReference(candidateRow, fullRows, game);
    if (candidateRow && pieceRows.length)
      return classifyAnalysisMoveAgainstReference(
        candidateRow,
        pieceRows,
        game,
      );
    if (playedMoveRow)
      return classifyAnalysisMoveAgainstReference(
        playedMoveRow,
        [playedMoveRow],
        game,
      );
    return null;
  }

  function moveClassKeyForFenAndUci(fen, uci) {
    if (!fen || !uci) return "";
    const game = readOnlyGameForFen(fen);
    if (!game) return "";
    return moveClassKeyForStyle(classificationForFenAndUci(fen, uci, game));
  }
  function classificationForHistoryNode(node) {
    if (!node?.parent || !node.uci) return null;
    const baseVersion = analysisVersionForFen(node.parent.fen);
    const playedMoveVersion = playedMoveAnalysisVersionForFenAndUci(
      node.parent.fen,
      node.uci,
    );
    let cachedMoveClassKey = String(node.moveClassKey || "");
    let cacheKey = `${baseVersion}|${playedMoveVersion}|${cachedMoveClassKey}`;
    if (node._classificationCacheKey === cacheKey)
      return node._classificationCache || null;
    const game = readOnlyGameForFen(node.parent.fen);
    if (!game) return null;
    let result = classificationForFenAndUci(node.parent.fen, node.uci, game);
    if (!result && cachedMoveClassKey) {
      // Move not in engine's top analysis rows — fall back to imported PGN annotation
      result = moveClassStyleForKey(cachedMoveClassKey) || null;
    }
    if (result) {
      const resolvedMoveClassKey = moveClassKeyForStyle(result);
      if (resolvedMoveClassKey && resolvedMoveClassKey !== cachedMoveClassKey) {
        node.moveClassKey = resolvedMoveClassKey;
        cachedMoveClassKey = resolvedMoveClassKey;
      }
    }
    cacheKey = `${baseVersion}|${playedMoveVersion}|${cachedMoveClassKey}`;
    node._classificationCacheKey = cacheKey;
    node._classificationCache = result || null;
    return result;
  }

  function currentGlobalClassificationRows(game = currentGame()) {
    const fen = state.current?.fen || game?.fen?.() || "";
    if (!fen) return [];
    const fullRows = fullPositionRowsForFen(fen);
    if (fullRows.length) return fullRows;
    if (state.selectedSquare) return [];
    const legalUcis = legalUciSetForGame(game);
    return normalizeAnalysisRows(
      state.analysisRows.filter(
        (candidate) => candidate?.bestUci && legalUcis.has(candidate.bestUci),
      ),
      fen,
    );
  }

  function classifyAnalysisMoveAgainstReference(row, referenceRows, game) {
    if (!row?.bestUci) return null;
    if (!referenceRows?.length) return null;
    const rowIndex = referenceRows.findIndex(
      (candidate) => candidate.bestUci === row.bestUci,
    );
    if (rowIndex >= 0) {
      return classifyAnalysisMove(
        referenceRows[rowIndex],
        rowIndex,
        referenceRows,
        game,
      );
    }
    const best = referenceRows[0] || row;
    return classifyLossMove(best, row);
  }

  function reportRailVisible() {
    if (isArcadeMode()) return false;
    // Report is visible if imported PGN analysis is complete
    if (state.importedPgnReportReady && !state.awaitingImportedPgnAnalysis) return true;
    // Or if we have a restored imported PGN game tree with cached analysis (after page refresh)
    if (Array.isArray(state.importPlaybackNodeIds) && state.importPlaybackNodeIds.length > 0 && state.positionAnalysisCache?.size > 0 && !state.awaitingImportedPgnAnalysis) return true;
    return false;
  }

  function syncReportVisibility(visible = reportRailVisible()) {
    const rightRail = ui.coachCard?.closest(".right");
    const workspace = rightRail?.closest(".workspace");
    if (rightRail) rightRail.style.display = visible ? "" : "none";
    if (workspace && !isArcadeMode()) {
      workspace.classList.toggle("report-rail-hidden", !visible);
      workspace.style.gridTemplateColumns = visible ? "" : "minmax(0, 1fr)";
    }
  }

  function moverSidedEval(row, fen) {
    const evalInfo = whiteCentricEvalInfo(row, fen);
    if (!evalInfo?.hasEval) return 0;
    const moverColor = sideToMoveForFen(fen);
    return moverColor === "white" ? evalInfo.value : -evalInfo.value;
  }

  function legalMovesForColor(boardFen, color) {
    try {
      const parts = String(boardFen || "").split(" ");
      parts[1] = color;
      parts[3] = "-";
      const probe = new Chess(parts.join(" "));
      return probe.moves({ verbose: true });
    } catch (_) {
      return [];
    }
  }

  function hangingPiecesForColor(boardMap, attackMap, color) {
    const detected = detectHangingPieces(boardMap, attackMap);
    return color === "white" ? detected.white || [] : detected.black || [];
  }

  function totalHangingValue(entries) {
    return (entries || []).reduce(
      (sum, entry) => sum + Math.max(0, Number(entry?.value) || 0),
      0,
    );
  }

  function moveFeelsImportant(row, rows, fen) {
    const game = readOnlyGameForFen(fen);
    const parsed = parseUci(row?.bestUci || "");
    if (!row?.bestUci || !rows?.length || !game || !parsed) return false;
    if (game.in_check?.()) return false;
    if (parsed.promotion === "q") return false;
    const bestMate = Number(row?.mate || 0);
    const secondMate = Number(rows?.[1]?.mate || 0);
    const secondEval = rows[1] ? moverSidedEval(rows[1], fen) : null;
    const alternativeIsAlsoWinningMate = bestMate > 0 && secondMate > 0;
    if (!alternativeIsAlsoWinningMate && secondEval != null && secondEval >= 700)
      return false;
    return true;
  }

  function newlyExposedOwnSacrificeValue(
    beforeBoard,
    afterBoard,
    moverCode,
    enemyCode,
    beforeAttackMap,
    afterAttackMap,
  ) {
    let maxValue = 0;
    for (const [square, piece] of afterBoard.entries()) {
      if (!piece || piece.color !== moverCode || piece.type === "k") continue;
      const afterRisk = computeSEE(afterBoard, square, enemyCode, afterAttackMap);
      if (afterRisk <= 0) continue;
      const beforePiece = beforeBoard.get(square);
      const beforeRisk =
        beforePiece && beforePiece.color === moverCode
          ? computeSEE(beforeBoard, square, enemyCode, beforeAttackMap)
          : 0;
      if (beforeRisk > 0) continue;
      maxValue = Math.max(maxValue, PIECE_VALUES[piece.type] || 0);
    }
    return maxValue;
  }

  // Compute evaluation from mover's perspective after the move
  function moverSidedEvalForAfterMove(row, afterFen) {
    return moverSidedEval(row, afterFen);
  }

  // Compute total value of opponent's hanging pieces (attacked by mover, not defended)
  function computeOpponentHangingValue(afterBoard, afterAttackMap, moverCode, enemyCode) {
    let totalValue = 0;
    for (const [square, piece] of afterBoard.entries()) {
      if (!piece || piece.color !== enemyCode) continue;
      // Get pieces attacking this square
      const attackers = moverCode === "w"
        ? (afterAttackMap.get(square)?.white || [])
        : (afterAttackMap.get(square)?.black || []);
      if (attackers.length === 0) continue; // not attacked
      // Check if defended by friendly piece
      const defenders = moverCode === "w"
        ? (afterAttackMap.get(square)?.black || [])
        : (afterAttackMap.get(square)?.white || []);
      if (defenders.length > 0) continue; // defended
      // It's hanging!
      totalValue += PIECE_VALUES[piece.type] || 0;
    }
    return totalValue;
  }

  // Compute total value of our own hanging pieces (attacked by opponent, not defended)
  function computeOurHangingValue(afterBoard, afterAttackMap, moverCode, enemyCode) {
    let totalValue = 0;
    for (const [square, piece] of afterBoard.entries()) {
      if (!piece || piece.color !== moverCode) continue;
      // Get pieces attacking this square
      const attackers = moverCode === "w"
        ? (afterAttackMap.get(square)?.black || [])
        : (afterAttackMap.get(square)?.white || []);
      if (attackers.length === 0) continue; // not attacked
      // Check if defended by friendly piece
      const defenders = moverCode === "w"
        ? (afterAttackMap.get(square)?.white || [])
        : (afterAttackMap.get(square)?.black || []);
      if (defenders.length > 0) continue; // defended
      // It's hanging!
      totalValue += PIECE_VALUES[piece.type] || 0;
    }
    return totalValue;
  }

  function computeSafeThreatSummary(boardFen, boardMap, attackerCode, attackMap = null) {
    try {
      const moves = legalMovesForColor(boardFen, attackerCode);
      const resolvedAttackMap = attackMap || buildAttackMap(boardMap);
      const seenSquares = new Set();
      let totalCp = 0;
      let maxCp = 0;
      let targetCount = 0;
      for (const move of moves) {
        const flags = String(move?.flags || "");
        if (!move?.to || (!move.captured && !flags.includes("e"))) continue;
        if (seenSquares.has(move.to)) continue;
        const targetPiece = boardMap.get(move.to);
        const targetType = move.captured || (flags.includes("e") ? "p" : targetPiece?.type);
        if (!targetType || targetType === "k") continue;
        if (targetPiece && targetPiece.color === attackerCode) continue;
        if (computeSEE(boardMap, move.to, attackerCode, resolvedAttackMap) <= 0)
          continue;
        const valueCp = pieceValueCp(targetType);
        seenSquares.add(move.to);
        targetCount += 1;
        totalCp += valueCp;
        maxCp = Math.max(maxCp, valueCp);
      }
      return { totalCp, maxCp, targetCount };
    } catch (_) {
      return { totalCp: 0, maxCp: 0, targetCount: 0 };
    }
  }

  function brilliantDiagnostics(row, rows, fen) {
    if (!moveFeelsImportant(row, rows, fen)) {
      return { result: false, reason: "not-important" };
    }
    const parsed = parseUci(row?.bestUci || "");
    if (!parsed?.from || !parsed?.to) {
      return { result: false, reason: "bad-uci" };
    }
    const afterFen = nextFenForUci(fen, row.bestUci);
    if (!afterFen) {
      return { result: false, reason: "no-after-fen" };
    }
    const moverColor = sideToMoveForFen(fen);
    const moverCode = moverColor === "white" ? "w" : "b";
    const enemyCode = moverCode === "w" ? "b" : "w";
    let beforeGame = readOnlyGameForFen(fen);
    let afterGame = readOnlyGameForFen(afterFen);
    if (!beforeGame || !afterGame) {
      try {
        beforeGame = new Chess(fen);
        afterGame = new Chess(afterFen);
      } catch (_) {
        return { result: false, reason: "bad-game" };
      }
    }
    const probe = new Chess(fen);
    const played = probe.move({
      from: parsed.from,
      to: parsed.to,
      promotion: parsed.promotion || undefined,
    });
    if (!played) {
      return { result: false, reason: "illegal-move" };
    }
    const beforeBoard = buildBoardMap(beforeGame);
    const afterBoard = buildBoardMap(afterGame);
    const movedPiece = beforeBoard.get(parsed.from);
    const movedPieceAfter = afterBoard.get(parsed.to);
    if (
      !movedPiece ||
      !movedPieceAfter ||
      movedPieceAfter.color !== moverCode ||
      movedPiece.type === "k" ||
      movedPiece.type === "p"
    ) {
      return { result: false, reason: "piece-not-eligible" };
    }
    const beforeAttackMap = buildAttackMap(beforeBoard);
    const afterAttackMap = buildAttackMap(afterBoard);
    const beforeRisk = computeSEE(beforeBoard, parsed.from, enemyCode, beforeAttackMap);
    const afterRisk = bestLegalExchangeGainOnSquare(afterFen, parsed.to);
    const enemyCanCaptureMovedPiece = afterRisk > 0;
    if (!enemyCanCaptureMovedPiece) {
      return {
        result: false,
        reason: "not-capturable",
        beforeRisk,
        afterRisk,
      };
    }
    const exchangeOfferCp = afterRisk;
    if (exchangeOfferCp < 100) {
      return {
        result: false,
        reason: "not-new-sacrifice",
        beforeRisk,
        afterRisk,
        exchangeOfferCp,
      };
    }
    const capturedTarget = captureTargetFromMove(beforeGame, played);
    const movedPieceValueCp = pieceValueCp(movedPiece.type);
    const capturedValueCp = pieceValueCp(capturedTarget?.type || "");
    const sacrificeNetCp = afterRisk - capturedValueCp;
    const clearMaterialSacrifice =
      movedPieceValueCp > capturedValueCp && sacrificeNetCp >= 100;
    const exchangeSacrifice = !clearMaterialSacrifice && exchangeOfferCp >= 100;
    if (!clearMaterialSacrifice && !exchangeSacrifice) {
      return {
        result: false,
        reason: "not-sacrifice",
        beforeRisk,
        afterRisk,
        exchangeOfferCp,
        movedPieceValueCp,
        capturedValueCp,
        sacrificeNetCp,
      };
    }
    const bestEval = moverSidedEval(row, fen);
    const secondEval = rows[1] ? moverSidedEval(rows[1], fen) : bestEval;
    const evalGap = rows[1] ? bestEval - secondEval : 0;
    const beforeTrapped = new Set(
      detectTrappedPieces(
        beforeBoard,
        moverCode,
        legalMovesForColor(fen, moverCode),
        beforeAttackMap,
      ).map((entry) => entry.square),
    );
    if (beforeTrapped.has(parsed.from) && !(/[+#]/.test(played.san || "") || Number(row?.mate || 0) > 0)) {
      return { result: false, reason: "already-trapped", evalGap };
    }
    const afterEval = moverSidedEvalForAfterMove(row, afterFen);
    if (afterEval < -1.25) {
      return { result: false, reason: "losing-after-move", afterEval, evalGap };
    }
    const positiveMate = Number(row?.mate || 0) > 0;
    const isCheck = /[+#]/.test(played.san || "");
    const safeThreat = computeSafeThreatSummary(
      afterFen,
      afterBoard,
      moverCode,
      afterAttackMap,
    );
    const critical = looksCritical(row, rows);
    const forcingCompensation =
      positiveMate ||
      safeThreat.maxCp >= movedPieceValueCp ||
      safeThreat.totalCp >= Math.max(300, exchangeOfferCp) ||
      evalGap >= 0.9 ||
      critical;
    const sacrificialCheck =
      isCheck && (clearMaterialSacrifice || positiveMate || evalGap >= 0.9);
    let result = false;
    if (clearMaterialSacrifice) {
      result = forcingCompensation || sacrificialCheck;
    } else if (capturedValueCp >= movedPieceValueCp) {
      result =
        positiveMate ||
        safeThreat.maxCp > movedPieceValueCp ||
        evalGap >= 1.0;
    } else {
      result = forcingCompensation || (isCheck && safeThreat.maxCp >= 300);
    }
    return {
      result,
      reason: result ? "passed" : "compensation-too-weak",
      beforeRisk,
      afterRisk,
      exchangeOfferCp,
      movedPieceValueCp,
      capturedValueCp,
      sacrificeNetCp,
      clearMaterialSacrifice,
      exchangeSacrifice,
      bestEval,
      secondEval,
      evalGap,
      afterEval,
      positiveMate,
      isCheck,
      safeThreat,
      critical,
      san: played.san || "",
    };
  }

  function brilliantDiagnosticsForFenAndUci(
    fen,
    uci,
    game = readOnlyGameForFen(fen),
  ) {
    if (!fen || !uci || !game) return null;
    const rows = fullPositionRowsForFen(fen);
    if (!rows.length) return null;
    const rowIndex = rows.findIndex((candidate) => candidate.bestUci === uci);
    if (rowIndex < 0) return null;
    return brilliantDiagnostics(rows[rowIndex], rows, fen);
  }

  function looksBrilliant(row, rows, fen) {
    return !!brilliantDiagnostics(row, rows, fen)?.result;
  }

  function bestDestinationNodeUci(square, game = currentGame()) {
    const candidates = visibleAnalysisRows(game)
      .map((row, index) => ({ row, index, parsed: parseUci(row.bestUci) }))
      .filter(({ parsed }) => parsed && parsed.to === square)
      .sort((a, b) => {
        const promotionGap =
          promotionPreferenceScore(b.parsed?.promotion) -
          promotionPreferenceScore(a.parsed?.promotion);
        if (
          a.parsed?.from === b.parsed?.from &&
          a.parsed?.to === b.parsed?.to &&
          promotionGap
        )
          return promotionGap;
        const evalGap = comparableEval(b.row) - comparableEval(a.row);
        if (evalGap) return evalGap;
        const depthGap = (b.row.depth || 0) - (a.row.depth || 0);
        if (depthGap) return depthGap;
        return a.index - b.index;
      });
    return candidates[0]?.row.bestUci || null;
  }

  function classifyAnalysisMove(row, index, rows, game) {
    const best = rows[0] || row;

    if (index === 0) {
      const fen = game?.fen?.() || state.current?.fen || "";
      if (looksBrilliant(row, rows, fen)) return MOVE_CLASS_STYLES.brilliant;
      if (looksCritical(row, rows)) return MOVE_CLASS_STYLES.critical;
      return MOVE_CLASS_STYLES.best;
    }

    return classifyLossMove(best, row);
  }

  function currentDisplayClassificationRows(
    game = currentGame(),
    selectedSquare = state.selectedSquare,
  ) {
    const legalUcis = selectedSquare
      ? legalUciSetForFen(state.current?.fen || game.fen(), selectedSquare)
      : legalUciSetForGame(game);
    const liveRows = normalizeAnalysisRows(
      state.analysisRows.filter(
        (candidate) => candidate?.bestUci && legalUcis.has(candidate.bestUci),
      ),
      state.current?.fen || game.fen(),
    );
    if (selectedSquare && liveRows.length) return liveRows;
    const fullRows = currentFullPositionRows();
    if (fullRows.length) return fullRows;
    return liveRows;
  }


  function classifyDisplayedMove(
    row,
    index,
    rows,
    game,
    selectedSquare = state.selectedSquare,
  ) {
    const globalRows = currentGlobalClassificationRows(game);
    const fen = state.current?.fen || game?.fen?.() || "";
    const cacheKey = analysisDisplayClassCacheKey(fen, row?.bestUci);
    const cachedKey = cacheKey ? _analysisDisplayClassCache.get(cacheKey) : "";
    const liveClass = globalRows.length
      ? classifyAnalysisMoveAgainstReference(row, globalRows, game)
      : null;
    const liveKey = moveClassKeyForStyle(liveClass);
    if (analysisDisplayClassCanSettle(game)) {
      if (cachedKey) return moveClassStyleForKey(cachedKey) || liveClass;
      if (cacheKey && liveKey) _analysisDisplayClassCache.set(cacheKey, liveKey);
      return liveClass;
    }
    if (cacheKey) {
      if (liveKey) _analysisDisplayClassCache.set(cacheKey, liveKey);
      else _analysisDisplayClassCache.delete(cacheKey);
    }
    return liveClass || moveClassStyleForKey(cachedKey);
  }

  function displayedMoveClassForUci(
    uci,
    game = currentGame(),
    selectedSquare = state.selectedSquare,
  ) {
    if (!uci) return null;
    const fen = state.current?.fen || game?.fen?.() || "";
    const globalRows = currentGlobalClassificationRows(game);
    const contextRows = currentDisplayClassificationRows(game, selectedSquare);
    const candidateRow =
      contextRows.find((candidate) => candidate.bestUci === uci) ||
      globalRows.find((candidate) => candidate.bestUci === uci) ||
      null;
    if (candidateRow && globalRows.length) {
      return classifyAnalysisMoveAgainstReference(
        candidateRow,
        globalRows,
        game,
      );
    }
    if (fen) {
      const resolved = classificationForFenAndUci(fen, uci, game);
      if (resolved) return resolved;
    }
    return null;
  }
  function isRecommendableMoveClass(moveClass) {
    return (
      moveClass !== MOVE_CLASS_STYLES.inaccuracy &&
      moveClass !== MOVE_CLASS_STYLES.mistake &&
      moveClass !== MOVE_CLASS_STYLES.blunder
    );
  }

  function comparableEval(row) {
    if (Number.isFinite(row?.mate))
      return row.mate > 0 ? 100000 - row.mate : -100000 - row.mate;
    return Number.isFinite(row?.scoreCp) ? row.scoreCp : 0;
  }

  function promotionPreferenceScore(promotion) {
    switch (String(promotion || "").toLowerCase()) {
      case "q":
        return 4;
      case "r":
        return 3;
      case "n":
        return 2;
      case "b":
        return 1;
      default:
        return 0;
    }
  }

  function compareOverlayMovePreference(a, b) {
    const samePath =
      a?.parsed?.from === b?.parsed?.from && a?.parsed?.to === b?.parsed?.to;
    if (samePath) {
      const promotionGap =
        promotionPreferenceScore(a.parsed?.promotion) -
        promotionPreferenceScore(b.parsed?.promotion);
      if (promotionGap) return promotionGap;
    }
    const evalGap = comparableEval(a?.row) - comparableEval(b?.row);
    if (evalGap) return evalGap;
    const depthGap = (a?.row?.depth || 0) - (b?.row?.depth || 0);
    if (depthGap) return depthGap;
    return (b?.index || 0) - (a?.index || 0);
  }

  function boundedComparableEval(row) {
    const value = comparableEval(row);
    if (!Number.isFinite(value)) return 0;
    if (Math.abs(value) >= 100000) return value > 0 ? 2000 : -2000;
    return Math.max(-2000, Math.min(2000, value));
  }

  function expectedScoreFromEval(evalCp) {
    const cp = Math.max(-2000, Math.min(2000, Number(evalCp) || 0));
    return 1 / (1 + Math.exp(-cp / 180));
  }

  function expectedScoreForRow(row) {
    return expectedScoreFromEval(boundedComparableEval(row));
  }

  function expectedScoreLoss(bestRow, candidateRow) {
    return Math.max(
      0,
      expectedScoreForRow(bestRow) - expectedScoreForRow(candidateRow),
    );
  }

  function centipawnLoss(bestRow, candidateRow) {
    return Math.max(
      0,
      boundedComparableEval(bestRow) - boundedComparableEval(candidateRow),
    );
  }

  function moveClassSeverity(moveClass) {
    if (moveClass === MOVE_CLASS_STYLES.excellent) return 1;
    if (moveClass === MOVE_CLASS_STYLES.okay) return 2;
    if (moveClass === MOVE_CLASS_STYLES.inaccuracy) return 3;
    if (moveClass === MOVE_CLASS_STYLES.mistake) return 4;
    if (moveClass === MOVE_CLASS_STYLES.blunder) return 5;
    return 0;
  }

  function worseMoveClass(a, b) {
    return moveClassSeverity(a) >= moveClassSeverity(b) ? a : b;
  }

  function classifyLossMove(bestRow, candidateRow) {
    const scoreLoss = expectedScoreLoss(bestRow, candidateRow);
    const cpLoss = centipawnLoss(bestRow, candidateRow);
    const byExpected =
      scoreLoss <= 0.018
        ? MOVE_CLASS_STYLES.excellent
        : scoreLoss <= 0.075
          ? MOVE_CLASS_STYLES.okay
          : scoreLoss <= 0.16
            ? MOVE_CLASS_STYLES.inaccuracy
            : scoreLoss <= 0.27
              ? MOVE_CLASS_STYLES.mistake
              : MOVE_CLASS_STYLES.blunder;
    const byCp =
      cpLoss <= 30
        ? MOVE_CLASS_STYLES.excellent
        : cpLoss <= 90
          ? MOVE_CLASS_STYLES.okay
          : cpLoss <= 180
            ? MOVE_CLASS_STYLES.inaccuracy
            : cpLoss <= 320
              ? MOVE_CLASS_STYLES.mistake
              : MOVE_CLASS_STYLES.blunder;
    return worseMoveClass(byExpected, byCp);
  }
  function moveDangerProfile(rows) {
    const best = rows[0];
    if (!best || rows.length < 2) {
      return {
        onlyMove: false,
        singlePlayableMove: false,
        nearBestCount: best ? 1 : 0,
        playableCount: best ? 1 : 0,
        seriousMistakes: 0,
        blunders: 0,
        secondLoss: 0,
        losingMateAlternatives: 0,
        bestEscapesMate: false,
        bestMateDistance: null,
        shortestAlternativeMate: null,
      };
    }
    const alternatives = rows.slice(1);
    const losses = alternatives.map((candidate) =>
      expectedScoreLoss(best, candidate),
    );
    const nearBestCount = 1 + losses.filter((loss) => loss <= 0.018).length;
    const playableCount = 1 + losses.filter((loss) => loss <= 0.055).length;
    const losingMateAlternatives = alternatives
      .filter(
        (candidate) => Number.isFinite(candidate?.mate) && candidate.mate < 0,
      )
      .map((candidate) => Math.abs(candidate.mate));
    const bestMateDistance =
      Number.isFinite(best?.mate) && best.mate < 0 ? Math.abs(best.mate) : null;
    return {
      onlyMove: nearBestCount === 1,
      singlePlayableMove: playableCount === 1,
      nearBestCount,
      playableCount,
      seriousMistakes: losses.filter((loss) => loss >= 0.13).length,
      blunders: losses.filter((loss) => loss >= 0.27).length,
      secondLoss: losses[0] || 0,
      losingMateAlternatives: losingMateAlternatives.length,
      bestEscapesMate:
        bestMateDistance == null && losingMateAlternatives.length > 0,
      bestMateDistance,
      shortestAlternativeMate: losingMateAlternatives.length
        ? Math.min(...losingMateAlternatives)
        : null,
    };
  }

  function looksCritical(row, rows) {
    if (!row?.bestUci || rows.length < 2) return false;
    const danger = moveDangerProfile(rows);
    if (danger.bestEscapesMate) return true;
    if (
      danger.bestMateDistance != null &&
      danger.shortestAlternativeMate != null &&
      danger.shortestAlternativeMate < danger.bestMateDistance
    )
      return true;
    return (
      danger.singlePlayableMove &&
      (danger.secondLoss >= 0.085 || danger.seriousMistakes >= 2)
    );
  }

  function materialEdge(game, color) {
    const board = game.board();
    let own = 0;
    let opp = 0;
    for (const row of board) {
      for (const piece of row) {
        if (!piece) continue;
        const value = PIECE_VALUES[piece.type] || 0;
        if (piece.color === color) own += value;
        else opp += value;
      }
    }
    return own - opp;
  }

  function onBoardClick(event) {
    resumeAudioContext();
    primeSoundBank();
    if (Date.now() < state.ignoreClicksUntil || state.dragState) return;
    const squareEl = event.target.closest("[data-square]");
    if (!squareEl) return;
    clearBoardAnnotations();
    handleSquareSelection(squareEl.dataset.square);
  }

  function onBoardContextMenu(event) {
    const square = squareFromPointerEvent(event);
    if (!square) return;
    event.preventDefault();
  }

  function onOverlayClick(event) {
    if (Date.now() < state.ignoreClicksUntil || state.dragState) return;
    clearBoardAnnotations();
    const square = squareFromPointerEvent(event);
    const el = event.target.closest("[data-uci]");
    const hitType = el?.dataset.hit || "";
    const game = currentGame();
    if (el && hitType === "node") {
      const preferred = square ? bestDestinationNodeUci(square, game) : null;
      applyPrincipalMove(preferred || el.dataset.uci);
      return;
    }
    const selectedMove =
      square && state.selectedSquare
        ? uciToLegalMove(game, state.selectedSquare + square + "q")
        : null;
    if (square && (!el || game.get(square) || selectedMove)) {
      handleSquareSelection(square);
      return;
    }
    if (el) applyPrincipalMove(el.dataset.uci);
  }

  function onOverlayHover(event) {
    if (state.dragState?.dragging) return;
    const el = event.target.closest("[data-uci]");
    const square = squareFromPointerEvent(event);
    const hitType = el?.dataset.hit || "";
    const next =
      el && (hitType === "node" || !(square && currentGame().get(square)))
        ? hitType === "node" && square
          ? bestDestinationNodeUci(square, currentGame())
          : el.dataset.uci
        : null;
    if (next !== state.hoveredUci) {
      state.hoveredUci = next;
      scheduleOverlayHoverRender();
      schedulePatternDetection();
    }
  }

  function suppressBoardSelection(event) {
    event.preventDefault();
    clearBrowserSelection();
  }

  function suppressBoardSelectionOnRepeat(event) {
    if (event.detail > 1) suppressBoardSelection(event);
  }

  function onBoardPointerDown(event) {
    resumeAudioContext();
    primeSoundBank();
    if (isEditingElement(document.activeElement)) return;
    const square = squareFromPointerEvent(event);
    if (!square) return;
    if (event.button === 2) {
      suppressBoardSelection(event);
      startAnnotationDrag(square);
      return;
    }
    if (event.button !== 0) return;
    const game = currentGame();
    const piece = game.get(square);
    if (!piece || piece.color !== game.turn()) return;
    const allMoves = legalMovesForFen(state.current.fen);
    const legalTargetSquares = new Set(
      allMoves.filter((move) => move.from === square).map((move) => move.to),
    );
    suppressBoardSelection(event);
    const wasSelected = state.selectedSquare === square;
    state.dragState = {
      from: square,
      asset: pieceAsset(piece),
      legalTargetSquares,
      hoverSquare: null,
      boardRect: ui.boardGrid.getBoundingClientRect(),
      startX: event.clientX,
      startY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      dragging: false,
      keepSelectionOnRelease: !wasSelected,
    };
    if (!wasSelected) {
      state.selectedSquare = square;
      refreshSelectedPieceAnalysis();
    }
    window.addEventListener("pointermove", onGlobalPointerMove);
    window.addEventListener("pointerup", onGlobalPointerUp, true);
    window.addEventListener("pointercancel", onGlobalPointerCancel, true);
    window.addEventListener("contextmenu", onGlobalContextMenu, true);
  }

  function setDragCursorActive(active) {
    document.body.classList.toggle("dragging-cursor", !!active);
  }

  function startAnnotationDrag(square) {
    state.annotationDrag = { from: square, to: square };
    renderBoardAnnotations();
    window.addEventListener("pointermove", onAnnotationPointerMove);
    window.addEventListener("pointerup", onAnnotationPointerUp, true);
    window.addEventListener("pointercancel", onAnnotationPointerCancel, true);
    window.addEventListener("contextmenu", suppressBoardSelection, true);
  }

  function onAnnotationPointerMove(event) {
    if (!state.annotationDrag) return;
    const square = squareFromPointerEvent(event);
    if (square === state.annotationDrag.to) return;
    state.annotationDrag.to = square;
    renderBoardAnnotations();
  }

  function onAnnotationPointerUp(event) {
    if (!state.annotationDrag) return;
    const from = state.annotationDrag.from;
    const to = squareFromPointerEvent(event);
    stopAnnotationListeners();
    state.annotationDrag = null;
    if (!to) {
      renderBoardAnnotations();
      return;
    }
    toggleBoardAnnotation(from, to);
    renderBoard();
  }

  function onAnnotationPointerCancel() {
    if (!state.annotationDrag) return;
    stopAnnotationListeners();
    state.annotationDrag = null;
    renderBoardAnnotations();
  }

  function stopAnnotationListeners() {
    window.removeEventListener("pointermove", onAnnotationPointerMove);
    window.removeEventListener("pointerup", onAnnotationPointerUp, true);
    window.removeEventListener(
      "pointercancel",
      onAnnotationPointerCancel,
      true,
    );
    window.removeEventListener("contextmenu", suppressBoardSelection, true);
  }

  function onGlobalPointerMove(event) {
    if (!state.dragState) return;
    state.dragState.clientX = event.clientX;
    state.dragState.clientY = event.clientY;
    const dx = event.clientX - state.dragState.startX;
    const dy = event.clientY - state.dragState.startY;
    if (!state.dragState.dragging && Math.hypot(dx, dy) < 8) return;
    if (!state.dragState.dragging) {
      state.dragState.dragging = true;
      setDragCursorActive(true);
      state.dragState.hoverSquare = hoveredLegalDropSquareFromEvent(event);
      if (state.selectedSquare !== state.dragState.from) {
        state.selectedSquare = state.dragState.from;
        refreshSelectedPieceAnalysis();
      } else {
        renderBoard();
      }
    } else {
      const hoverSquare = hoveredLegalDropSquareFromEvent(event);
      if (hoverSquare !== (state.dragState.hoverSquare || null)) {
        state.dragState.hoverSquare = hoverSquare;
        renderBoard();
      }
      renderDragPiece();
    }
  }

  function onGlobalPointerUp(event) {
    if (!state.dragState) return;
    const drag = state.dragState;
    stopDragListeners();
    state.dragState = null;
    setDragCursorActive(false);
    ui.dragLayer.innerHTML = "";
    if (!drag.dragging) {
      state.ignoreClicksUntil = Date.now() + 120;
      if (drag.keepSelectionOnRelease) return;
      handleSquareSelection(drag.from);
      return;
    }
    state.ignoreClicksUntil = Date.now() + 180;
    const dropSquare = squareFromPointerEvent(event);
    finishDraggedMove(drag.from, dropSquare);
  }

  function onGlobalPointerCancel() {
    if (!state.dragState) return;
    stopDragListeners();
    const from = state.dragState.from;
    const wasDragging = state.dragState.dragging;
    state.dragState = null;
    setDragCursorActive(false);
    ui.dragLayer.innerHTML = "";
    if (wasDragging) {
      state.selectedSquare = from;
      refreshSelectedPieceAnalysis();
    }
  }

  function onGlobalContextMenu(event) {
    if (!state.dragState) return;
    event.preventDefault();
    state.ignoreClicksUntil = Date.now() + 180;
    cancelActiveDragAndClearSelection();
  }

  function cancelActiveDragAndClearSelection() {
    if (!state.dragState) return;
    stopDragListeners();
    state.dragState = null;
    setDragCursorActive(false);
    ui.dragLayer.innerHTML = "";
    state.selectedSquare = null;
    refreshSelectedPieceAnalysis();
  }

  function stopDragListeners() {
    window.removeEventListener("pointermove", onGlobalPointerMove);
    window.removeEventListener("pointerup", onGlobalPointerUp, true);
    window.removeEventListener("pointercancel", onGlobalPointerCancel, true);
    window.removeEventListener("contextmenu", onGlobalContextMenu, true);
  }

  function hoveredLegalDropSquareFromEvent(event) {
    if (!state.dragState?.dragging) return null;
    const square = squareFromPointerEvent(event);
    if (!square) return null;
    return state.dragState.legalTargetSquares?.has(square) ? square : null;
  }

  function finishDraggedMove(from, to) {
    const game = currentGame();
    if (!to || to === from) {
      state.selectedSquare = from;
      refreshSelectedPieceAnalysis();
      return;
    }
    const move = uciToLegalMove(game, from + to + "q");
    if (move) {
      const canonical = move.from + move.to + (move.promotion || "");
      const moveClassKey = moveClassKeyForStyle(
        displayedMoveClassForUci(canonical, game, from),
      );
      state.selectedSquare = null;
      applyPrincipalMove(canonical, { moveClassKey });
      return;
    }
    const piece = game.get(to);
    if (piece && piece.color === game.turn()) {
      state.selectedSquare = to;
      refreshSelectedPieceAnalysis();
      return;
    }
    state.selectedSquare = from;
    refreshSelectedPieceAnalysis();
  }

  function onSearchSettingChange() {
    const kind = ui.limitKind.value === "depth" ? "depth" : "time";
    if (kind === "depth") {
      state.depthLimitValue = clampInt(
        ui.limitValue.value,
        1,
        245,
        state.depthLimitValue,
      );
    } else {
      state.timeLimitValue = clampInt(
        ui.limitValue.value,
        1,
        1000000,
        state.timeLimitValue,
      );
    }
    state.limitKind = kind;
    state.limitValue =
      state.limitKind === "depth"
        ? state.depthLimitValue
        : state.timeLimitValue;
    state.linesShown = clampInt(ui.linesShown.value, 1, 10, 3);
    state.threads = clampInt(
      ui.threadsValue.value,
      1,
      MAX_ENGINE_THREADS,
      state.threads,
    );
    syncSearchSettingsControls();
    state.analysisRows = Array.from(state.analysisMap.values())
      .sort((a, b) => a.multipv - b.multipv)
      .slice(0, activeAnalysisLimit());
    snapshotFullPositionAnalysis();
    saveSettings();
    renderMeta();
    renderAnalysisFull();
    renderBoardOverlay();
    applyUpdatedSearchSettings();
    restartSearchIfNeeded();
  }

  function openSettingsModal() {
    syncSearchSettingsControls();
    ui.settingsModal.classList.add("open");
    ui.settingsModal.setAttribute("aria-hidden", "false");
  }

  function closeSettingsModal() {
    ui.settingsModal.classList.remove("open");
    ui.settingsModal.setAttribute("aria-hidden", "true");
  }

  function toggleEngineLines() {
    state.engineLinesHidden = !state.engineLinesHidden;
    if (state.engineLinesHidden) state.hoveredUci = null;
    renderMeta();
    renderAnalysisFull();
    renderBoardOverlay();
  }
  function onGlobalKeyDown(event) {
    resumeAudioContext();
    primeSoundBank();
    if (ui.settingsModal?.classList.contains("open")) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSettingsModal();
      }
      return;
    }
    if (ui.importModal?.classList.contains("open")) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeImportModal();
      }
      return;
    }
    if (ui.exportModal?.classList.contains("open")) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeExportModal();
      }
      return;
    }
    if (isEditingElement(document.activeElement)) {
      if (event.key === "Escape") document.activeElement.blur();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      flipBoard();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
      event.preventDefault();
      newGame();
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      navigateStart();
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      navigateEnd();
      return;
    }
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "v") {
      event.preventDefault();
      importClipboard();
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      if (terminalPositionInfo(currentGame())) {
        syncTerminalAnalysisState();
        return;
      }
      state.engineMode === "analysis"
        ? haltEngine(true)
        : startAnalysis("analysis");
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      navigateBack();
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      navigateForward();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      navigateSibling(-1);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      navigateSibling(1);
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      deleteCurrentNode();
    }
  }

  function invalidateGameCache() {
    _cachedGameFen = null;
    _cachedGame = null;
    _cachedCurrentPathNodeId = "";
    _cachedCurrentPath = null;
    _cachedCurrentPathFenSet = null;
  }

  function invalidateLegalUciSetCache() {
    _legalUciSetKey = "";
    _legalUciSetCache = null;
  }

  function invalidateHistoryRenderCache() {
    _lastHistoryHtml = "";
    _cachedVisibleHistoryPathNodeId = "";
    _cachedVisibleHistoryPath = null;
  }

  function invalidateEvalChartRenderCache() {
    _lastEvalChartHtml = "";
  }

  function currentGame() {
    if (_cachedGame && _cachedGameFen === state.current.fen) return _cachedGame;
    _cachedGameFen = state.current.fen;
    _cachedGame = new Chess(state.current.fen);
    return _cachedGame;
  }

  function importedPgnPlaybackNodes() {
    if (!Array.isArray(state.importPlaybackNodeIds)) return [];
    return state.importPlaybackNodeIds
      .map((nodeId) => nodeRegistry.get(nodeId) || null)
      .filter(Boolean);
  }

  function currentDisplayNode() {
    if (!state.awaitingImportedPgnAnalysis) return state.current;
    const playbackNodes = importedPgnPlaybackNodes();
    if (!playbackNodes.length) return state.current;
    const index = Math.max(
      0,
      Math.min(playbackNodes.length - 1, state.importPlaybackIndex || 0),
    );
    return playbackNodes[index] || state.current;
  }

  function currentDisplayGame() {
    const node = currentDisplayNode();
    return node?.fen ? readOnlyGameForFen(node.fen) || currentGame() : currentGame();
  }

  function importedPgnPlaybackActive() {
    return (
      !!state.awaitingImportedPgnAnalysis &&
      Array.isArray(state.importPlaybackNodeIds) &&
      state.importPlaybackNodeIds.length > 0
    );
  }

  function clearImportedPgnPlayback(resetNodes = false) {
    clearTimeout(state.importPlaybackTimer);
    state.importPlaybackTimer = null;
    state.importPlaybackIndex = 0;
    if (resetNodes) state.importPlaybackNodeIds = [];
  }

  function importedPgnPlaybackTargetCount() {
    return importedPgnAnalysisProgress().complete;
  }

  function renderImportedPgnPlaybackFrame() {
    renderHistory();
    renderMovePanel();
    renderBoard();
  }

  function scheduleImportedPgnPlaybackTick() {
    if (state.importPlaybackTimer || !state.awaitingImportedPgnAnalysis) return;
    state.importPlaybackTimer = setTimeout(() => {
      state.importPlaybackTimer = null;
      syncImportedPgnPlayback(true);
    }, 240);
  }

  function syncImportedPgnPlayback(forceRender = false) {
    if (!state.awaitingImportedPgnAnalysis) {
      clearImportedPgnPlayback();
      if (forceRender) renderImportedPgnPlaybackFrame();
      return;
    }
    const playbackNodes = importedPgnPlaybackNodes();
    if (!playbackNodes.length) {
      if (forceRender) renderImportedPgnPlaybackFrame();
      return;
    }
    const targetIndex = Math.max(
      0,
      Math.min(playbackNodes.length - 1, importedPgnPlaybackTargetCount()),
    );
    if (!Number.isFinite(state.importPlaybackIndex)) state.importPlaybackIndex = 0;
    if (state.importPlaybackIndex > targetIndex) {
      state.importPlaybackIndex = targetIndex;
    } else if (state.importPlaybackIndex < targetIndex) {
      state.importPlaybackIndex += 1;
      forceRender = true;
    }
    if (forceRender) renderImportedPgnPlaybackFrame();
    if (state.importPlaybackIndex < targetIndex) {
      scheduleImportedPgnPlaybackTick();
    }
  }

  function readOnlyGameForFen(fen) {
    if (!fen) return null;
    if (_fenGameCache.has(fen)) {
      const cached = _fenGameCache.get(fen);
      _fenGameCache.delete(fen);
      _fenGameCache.set(fen, cached);
      return cached;
    }
    try {
      const game = new Chess(fen);
      _fenGameCache.set(fen, game);
      trimCacheMap(_fenGameCache, 256);
      return game;
    } catch (_) {
      return null;
    }
  }

  function terminalPositionInfo(game = currentGame()) {
    if (!game?.game_over?.()) return null;
    if (game.in_checkmate?.()) {
      const winner = game.turn() === "w" ? "Black" : "White";
      return {
        shortLabel: "Checkmate",
        title: "Checkmate",
        message: `${winner} won by checkmate. No legal moves remain.`,
      };
    }
    if (game.in_stalemate?.()) {
      return {
        shortLabel: "Stalemate",
        title: "Stalemate",
        message: "The game is drawn by stalemate. No legal moves remain.",
      };
    }
    return {
      shortLabel: "Game over",
      title: "Game over",
      message:
        "This position is terminal, so there are no moves left to analyze.",
    };
  }

  function syncTerminalAnalysisState(game = currentGame()) {
    const terminal = terminalPositionInfo(game);
    if (!terminal) return false;
    cancelAnimationFrame(state.searchRaf || 0);
    state.searchRaf = 0;
    clearAnalysisPublishTimer();
    state.pendingSearch = false;
    state.silentSearchRetries = 0;
    state.engineBusy = false;
    state.stopRequested = false;
    state.awaitingFinalAnalysis = false;
    state.engineMode = "halt";
    state.terminalAutoHalt = true;
    state.engineStatus = terminal.title;
    state.engineHint = terminal.message;
    renderEngineStatus();
    renderMeta();
    renderAnalysisFull();
    return true;
  }

  function currentMoveNodes() {
    return currentPath().slice(1);
  }

  function currentOpeningNodes() {
    return currentMoveNodes();
  }

  function currentOpeningUciPath() {
    return currentOpeningNodes()
      .map((node) => node.uci)
      .filter(Boolean)
      .join(",");
  }

  function currentLineSans() {
    return currentMoveNodes()
      .map((node) => node.san)
      .filter(Boolean);
  }

  function currentExportFen() {
    return currentGame().fen();
  }

  function currentExportPgn() {
    const rootFen = state.root?.fen || START_FEN;
    const game = new Chess(rootFen);
    if (rootFen !== START_FEN) {
      game.header("SetUp", "1");
      game.header("FEN", rootFen);
    }
    for (const san of currentLineSans()) {
      const move = game.move(san, { sloppy: true });
      if (!move) break;
    }
    const pgn = game.pgn({ max_width: 0, newline_char: "\n" }).trim();
    return pgn || "*";
  }

  async function copyText(text) {
    const value = String(text || "");
    if (!value) return false;
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (_) {
      const temp = document.createElement("textarea");
      temp.value = value;
      temp.style.position = "fixed";
      temp.style.opacity = "0";
      document.body.appendChild(temp);
      temp.select();
      const copied = document.execCommand("copy");
      temp.remove();
      return !!copied;
    }
  }

  async function copyExportField(field, successLabel) {
    if (!field) return;
    const copied = await copyText(field.value);
    state.engineStatus = copied ? successLabel : "Copy failed";
    state.engineHint = copied
      ? "Ready to paste anywhere."
      : "Clipboard access was blocked";
    renderEngineStatus();
  }

  function openExportModal() {
    ui.exportFenOutput.value = currentExportFen();
    ui.exportPgnOutput.value = currentExportPgn();
    ui.exportModal.classList.add("open");
    ui.exportModal.setAttribute("aria-hidden", "false");
  }

  function isArcadeMode() {
    return state.workspaceMode === "arcade";
  }

  function currentArcadeVariant() {
    return ARCADE_VARIANTS[state.arcadeVariantKey] || ARCADE_VARIANTS.drunkfish;
  }

  function isWeirdhorseVariant() {
    return isArcadeMode() && currentArcadeVariant().mode === "weirdhorse";
  }

  function randInt(min, max) {
    const lower = Math.min(min, max);
    const upper = Math.max(min, max);
    return lower + Math.floor(Math.random() * (upper - lower + 1));
  }

  function currentTurnColor(game = currentGame()) {
    return game.turn() === "b" ? "black" : "white";
  }

  function arcadeHumanCanMove(game = currentGame()) {
    const variant = currentArcadeVariant();
    return (
      !isArcadeMode() ||
      (!state.arcadeThinking && currentTurnColor(game) === variant.playerColor)
    );
  }

  function resetArcadeDrift() {
    state.arcadeHiddenElo = randInt(1200, 1650);
    state.arcadeTargetElo = state.arcadeHiddenElo;
    state.arcadeBurstPliesLeft = 0;
    state.arcadeThinking = false;
    state.weirdhorseProfilesByCycle = new Map();
  }

  function setArcadeVariant(key, options = {}) {
    const normalized = String(key || "").trim().toLowerCase();
    if (!ARCADE_VARIANTS[normalized]) return;
    state.arcadeVariantKey = normalized;
    if (options.reset !== false && isArcadeMode()) {
      newGame();
      return;
    }
    setArcadeStatusForCurrentTurn();
    renderAll();
  }

  function currentPlyCount(node = state.current) {
    let count = 0;
    let cursor = node;
    while (cursor?.parent) {
      count += 1;
      cursor = cursor.parent;
    }
    return count;
  }

  function weirdhorseCycleIndex(node = state.current) {
    return Math.floor(currentPlyCount(node) / 10);
  }

  function weirdhorseProfileForCycle(cycleIndex) {
    const key = Math.max(0, Number(cycleIndex) || 0);
    const existing = state.weirdhorseProfilesByCycle.get(key);
    if (existing) return existing;
    const picked =
      WEIRDHORSE_PROFILES[randInt(0, WEIRDHORSE_PROFILES.length - 1)] ||
      WEIRDHORSE_PROFILES[0];
    state.weirdhorseProfilesByCycle.set(key, picked);
    return picked;
  }

  function currentWeirdhorseProfile(node = state.current) {
    return weirdhorseProfileForCycle(weirdhorseCycleIndex(node));
  }

  function pliesUntilNextWeirdhorseShuffle(node = state.current) {
    const ply = currentPlyCount(node);
    const used = ply % 10;
    return used === 0 ? 10 : 10 - used;
  }

  function weirdhorseOffsetsText(profile = currentWeirdhorseProfile()) {
    return (profile?.offsets || [])
      .map((offset) => `${offset.dx > 0 ? "+" : ""}${offset.dx},${offset.dy > 0 ? "+" : ""}${offset.dy}`)
      .join("  ");
  }

  function syncCastlingRightsToBoard(game) {
    const white = game.getCastlingRights("w");
    const black = game.getCastlingRights("b");
    game.setCastlingRights("w", {
      k:
        !!white.k &&
        game.get("e1")?.type === "k" &&
        game.get("e1")?.color === "w" &&
        game.get("h1")?.type === "r" &&
        game.get("h1")?.color === "w",
      q:
        !!white.q &&
        game.get("e1")?.type === "k" &&
        game.get("e1")?.color === "w" &&
        game.get("a1")?.type === "r" &&
        game.get("a1")?.color === "w",
    });
    game.setCastlingRights("b", {
      k:
        !!black.k &&
        game.get("e8")?.type === "k" &&
        game.get("e8")?.color === "b" &&
        game.get("h8")?.type === "r" &&
        game.get("h8")?.color === "b",
      q:
        !!black.q &&
        game.get("e8")?.type === "k" &&
        game.get("e8")?.color === "b" &&
        game.get("a8")?.type === "r" &&
        game.get("a8")?.color === "b",
    });
  }

  function weirdhorseKnightMoves(game, fromSquare) {
    if (!isWeirdhorseVariant()) return [];
    const piece = game.get(fromSquare);
    if (!piece || piece.type !== "n" || piece.color !== game.turn()) return [];
    const profile = currentWeirdhorseProfile();
    const origin = squareIndex(fromSquare);
    const moves = [];
    for (const offset of profile.offsets) {
      const file = origin.file + offset.dx;
      const rank = origin.rank + offset.dy;
      if (file < 0 || file > 7 || rank < 0 || rank > 7) continue;
      const toSquare = `${String.fromCharCode(97 + file)}${rank + 1}`;
      const target = game.get(toSquare);
      if (target?.color === piece.color || target?.type === "k") continue;
      const fen = buildWeirdhorseFenAfterMove(game, {
        from: fromSquare,
        to: toSquare,
      });
      if (!fen) continue;
      try {
        const probe = new Chess(fen);
        probe.setTurn(piece.color);
        if (probe.inCheck()) continue;
      } catch (_) {
        continue;
      }
      moves.push({
        color: piece.color,
        from: fromSquare,
        to: toSquare,
        piece: "n",
        captured: target?.type || undefined,
        san: `H${fromSquare}${target ? "x" : "-"}${toSquare}`,
      });
    }
    return moves;
  }

  function buildWeirdhorseFenAfterMove(game, move) {
    const piece = game.get(move.from);
    if (!piece || piece.type !== "n") return null;
    const target = game.get(move.to);
    if (target?.color === piece.color) return null;

    const scratch = new Chess(game.fen());
    scratch.remove(move.from);
    if (target) scratch.remove(move.to);
    scratch.put(piece, move.to);
    syncCastlingRightsToBoard(scratch);
    scratch.setTurn(game.turn() === "w" ? "b" : "w");

    const baseFenParts = game.fen().split(" ");
    const nextFenParts = scratch.fen().split(" ");
    const halfmoveClock =
      target || piece.type === "p"
        ? 0
        : Math.max(0, parseInt(baseFenParts[4] || "0", 10) + 1);
    const fullmoveNumber = Math.max(
      1,
      parseInt(baseFenParts[5] || "1", 10) + (game.turn() === "b" ? 1 : 0),
    );
    return `${nextFenParts[0]} ${nextFenParts[1]} ${nextFenParts[2]} - ${halfmoveClock} ${fullmoveNumber}`;
  }

  function weirdhorseCustomMoveForUci(game, uci) {
    const parsed = parseUci(uci);
    if (!parsed) return null;
    return (
      weirdhorseKnightMoves(game, parsed.from).find((move) => move.to === parsed.to) || null
    );
  }

  function weirdhorseLegalMoves(game, selectedSquare = "") {
    if (!isWeirdhorseVariant()) {
      return selectedSquare
        ? (() => {
            const piece = game.get(selectedSquare);
            if (!piece || piece.color !== game.turn()) return [];
            return game.moves({ square: selectedSquare, verbose: true });
          })()
        : game.moves({ verbose: true });
    }
    if (selectedSquare) {
      const piece = game.get(selectedSquare);
      if (!piece || piece.color !== game.turn()) return [];
      return piece.type === "n"
        ? weirdhorseKnightMoves(game, selectedSquare)
        : game.moves({ square: selectedSquare, verbose: true });
    }
    const standardMoves = game
      .moves({ verbose: true })
      .filter((move) => game.get(move.from)?.type !== "n");
    const horseMoves = [];
    for (const file of "abcdefgh") {
      for (let rank = 1; rank <= 8; rank += 1) {
        const square = `${file}${rank}`;
        const piece = game.get(square);
        if (piece?.type === "n" && piece.color === game.turn()) {
          horseMoves.push(...weirdhorseKnightMoves(game, square));
        }
      }
    }
    return [...standardMoves, ...horseMoves];
  }

  function weirdhorseAiCandidates(game) {
    const standardMoves = game
      .moves({ verbose: true })
      .filter((move) => game.get(move.from)?.type !== "n");
    const knightSquares = [];
    for (const file of "abcdefgh") {
      for (let rank = 1; rank <= 8; rank += 1) {
        const square = `${file}${rank}`;
        const piece = game.get(square);
        if (piece?.type === "n" && piece.color === game.turn()) {
          knightSquares.push(square);
        }
      }
    }
    const customKnightMoves = knightSquares.flatMap((square) =>
      weirdhorseKnightMoves(game, square),
    );
    return [
      ...standardMoves.map((move) => ({
        type: "standard",
        move,
        san: move.san,
        uci: move.from + move.to + (move.promotion || ""),
        fen: (() => {
          const scratch = new Chess(game.fen());
          scratch.move(move);
          return scratch.fen();
        })(),
      })),
      ...customKnightMoves.map((move) => ({
        type: "weirdhorse",
        move,
        san: move.san,
        uci: move.from + move.to,
        fen: buildWeirdhorseFenAfterMove(game, move),
      })).filter((candidate) => candidate.fen),
    ];
  }

  function nextArcadeTargetElo() {
    const roll = Math.random();
    if (roll < 0.15) return randInt(2450, 2850);
    if (roll < 0.4) return randInt(700, 1100);
    if (roll < 0.72) return randInt(1150, 1650);
    return randInt(1700, 2300);
  }

  function nextArcadeHiddenElo() {
    if (state.arcadeBurstPliesLeft <= 0) {
      state.arcadeTargetElo = nextArcadeTargetElo();
      state.arcadeBurstPliesLeft = randInt(2, 6);
    }
    state.arcadeBurstPliesLeft = Math.max(0, state.arcadeBurstPliesLeft - 1);

    const gap = state.arcadeTargetElo - state.arcadeHiddenElo;
    const step = randInt(85, 240);
    if (Math.abs(gap) <= step) {
      state.arcadeHiddenElo = state.arcadeTargetElo;
    } else {
      state.arcadeHiddenElo += Math.sign(gap) * step;
    }

    if (Math.abs(state.arcadeTargetElo - state.arcadeHiddenElo) < 90 && Math.random() < 0.45) {
      state.arcadeBurstPliesLeft = 0;
    }

    state.arcadeHiddenElo = Math.max(600, Math.min(3000, Math.round(state.arcadeHiddenElo)));
    return state.arcadeHiddenElo;
  }

  function setArcadeStatusForCurrentTurn() {
    if (!isArcadeMode()) return;
    const variant = currentArcadeVariant();
    const terminal = terminalPositionInfo(currentGame());
    if (terminal) {
      state.engineStatus = terminal.title;
      state.engineHint = terminal.message;
      return;
    }
    if (state.arcadeThinking) {
      state.engineStatus = "Opponent thinking";
      state.engineHint =
        variant.mode === "maia-drift"
          ? `Drunkfish drift is live. Test Elo this turn: ${state.arcadeHiddenElo}.`
          : variant.mode === "weirdhorse"
            ? `Current horse law: ${currentWeirdhorseProfile().label}.`
            : `Standard rules. Chosen strength: ${variant.opponentElo}.`;
      return;
    }
    if (currentTurnColor() === variant.playerColor) {
      state.engineStatus = "Your move";
      state.engineHint =
        variant.mode === "maia-drift"
          ? `Testing view: Drunkfish is currently on Elo ${state.arcadeHiddenElo}.`
          : variant.mode === "weirdhorse"
            ? `${currentWeirdhorseProfile().label} is active for ${pliesUntilNextWeirdhorseShuffle()} more plies.`
            : `Play a standard game against a human-like opponent at Elo ${variant.opponentElo}.`;
      return;
    }
    state.engineStatus = "Opponent ready";
    state.engineHint =
      variant.mode === "weirdhorse"
        ? "The horse law is loaded and visible."
        : variant.mode === "maia-drift"
          ? `Play a move to trigger the next drift. Current test Elo: ${state.arcadeHiddenElo}.`
          : `Play a move to let the opponent answer at Elo ${variant.opponentElo}.`;
  }

  async function requestArcadeMaiaMove(fen, eloSelf) {
    const variant = currentArcadeVariant();
    const response = await fetch("/api/arcade/maia-move", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fen,
        eloSelf,
        eloOppo: variant.opponentElo,
        modelType: variant.modelType,
        topK: variant.topK,
        topMoves: variant.topMoves,
        temperature: variant.temperature,
        seed: Date.now(),
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(String(data?.error || "Opponent move request failed."));
    }
    const move = String(data?.move || "").trim();
    if (!move) throw new Error("Opponent returned no move.");
    return {
      move,
      topMoves: Array.isArray(data?.topMoves) ? data.topMoves : [],
    };
  }

  async function requestWeirdhorseStockfishMove(game) {
    const candidates = weirdhorseAiCandidates(game);
    if (!candidates.length) {
      throw new Error("Weirdhorse found no legal moves.");
    }

    const scored = [];
    for (const candidate of candidates) {
      const analysis = await runPersistentToolEngineAnalysis(candidate.fen, 120, 1);
      const bestRow = analysis?.rows?.[0] || null;
      scored.push({
        ...candidate,
        _score: compareMoveScore(bestRow),
      });
    }

    scored.sort((a, b) => b._score - a._score);
    const finalists = scored.slice(0, Math.min(3, scored.length));
    const picked = finalists[randInt(0, finalists.length - 1)] || scored[0];
    if (!picked) throw new Error("Weirdhorse could not pick a move.");
    return picked;
  }

  function maybeQueueArcadeAiMove() {
    if (!isArcadeMode()) return;
    const game = currentGame();
    const variant = currentArcadeVariant();
    const terminal = terminalPositionInfo(game);
    if (terminal || currentTurnColor(game) !== variant.aiColor) {
      state.arcadeThinking = false;
      setArcadeStatusForCurrentTurn();
      renderMeta();
      renderAssistant();
      renderEngineStatus();
      return;
    }

    const fen = state.current?.fen || START_FEN;
    const requestId = state.arcadeRequestId + 1;
    state.arcadeRequestId = requestId;
    state.arcadeThinking = true;
    setArcadeStatusForCurrentTurn();
    renderMeta();
    renderAssistant();
    renderEngineStatus();

    const movePromise =
      variant.mode === "weirdhorse"
        ? requestWeirdhorseStockfishMove(game)
        : requestArcadeMaiaMove(
            fen,
            variant.mode === "maia-drift" ? nextArcadeHiddenElo() : variant.opponentElo,
          );

    movePromise
      .then((result) => {
        if (!isArcadeMode() || state.arcadeRequestId !== requestId) return;
        state.arcadeThinking = false;
        const selectedMove =
          variant.mode === "weirdhorse" ? result.uci || result.move : result.move;
        applyPrincipalMove(selectedMove, { source: "arcade-ai" });
      })
      .catch((error) => {
        if (!isArcadeMode() || state.arcadeRequestId !== requestId) return;
        state.arcadeThinking = false;
        state.engineStatus =
          "Opponent unavailable";
        state.engineHint = error?.message || String(error);
        renderMeta();
        renderAssistant();
        renderEngineStatus();
      });
  }

  function normalizeWorkspaceMode(mode) {
    const normalized = String(mode || "").trim().toLowerCase();
    return normalized === "arcade" || normalized === "review"
      ? "arcade"
      : "explore";
  }

  function syncWorkspaceUi() {
    const arcadeMode = isArcadeMode();
    if (ui.coachReviewCta) {
      ui.coachReviewCta.style.display = arcadeMode ? "none" : "";
    }
    if (ui.coachGoToReviewBtn) {
      ui.coachGoToReviewBtn.href = "/arcade";
      ui.coachGoToReviewBtn.textContent = "Open Arcade";
    }
    if (ui.resetBtn) {
      ui.resetBtn.textContent = arcadeMode ? "New Run" : "Reset Board";
    }
    if (ui.importBtn) {
      ui.importBtn.style.display = arcadeMode ? "none" : "";
    }
    if (ui.exportBtn) {
      ui.exportBtn.style.display = arcadeMode ? "none" : "";
    }
    if (ui.settingsBtn) {
      ui.settingsBtn.style.display = arcadeMode ? "none" : "";
    }
    if (ui.haltBtn) {
      ui.haltBtn.style.display = arcadeMode ? "none" : "";
    }
    state.recentImportSignInHref = arcadeMode
      ? "/sign-in?next=%2Farcade"
      : "/sign-in?next=%2Fanalysis";
  }

  function persistReviewHandoff(payload) {
    try {
      sessionStorage.setItem(STORAGE.reviewHandoff, JSON.stringify(payload));
      return true;
    } catch (_) {
      return false;
    }
  }

  function consumeReviewHandoff() {
    try {
      const raw = sessionStorage.getItem(STORAGE.reviewHandoff);
      if (!raw) return null;
      sessionStorage.removeItem(STORAGE.reviewHandoff);
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function currentReviewHandoffPayload() {
    const pgn = String(currentExportPgn() || "").trim();
    const fen = String(currentExportFen() || "").trim();
    return {
      pgn,
      fen,
      whitePlayerName: state.whitePlayerName,
      blackPlayerName: state.blackPlayerName,
      whitePlayerRating: state.whitePlayerRating,
      blackPlayerRating: state.blackPlayerRating,
      createdAt: Date.now(),
    };
  }

  function navigateToReviewForCurrentGame() {
    window.location.href = "/arcade";
  }

  function bootstrapReviewFromHandoff() {
    const handoff = consumeReviewHandoff();
    if (!handoff) return false;
    const pgn = String(handoff.pgn || "").trim();
    const fen = String(handoff.fen || "").trim();
    const whitePlayerName = String(handoff.whitePlayerName || "").trim();
    const blackPlayerName = String(handoff.blackPlayerName || "").trim();
    const whitePlayerRating = String(handoff.whitePlayerRating || "").trim();
    const blackPlayerRating = String(handoff.blackPlayerRating || "").trim();
    if (whitePlayerName || blackPlayerName) {
      setPlayerNames(whitePlayerName || "White", blackPlayerName || "Black");
    }
    setPlayerRatings(whitePlayerRating, blackPlayerRating);
    const text = pgn && pgn !== "*" ? pgn : fen;
    if (!text) return false;
    withGlobalImportLoader("Loading review game", () => loadFenOrPgnText(text))
      .then((imported) => {
        if (!imported) openImportModal();
      })
      .catch(() => {
        openImportModal();
      });
    return true;
  }

  function setWorkspaceMode(mode, options = {}) {
    const previousMode = state.workspaceMode;
    const normalized = normalizeWorkspaceMode(mode);
    const shouldOpenImport =
      typeof options.openImport === "boolean"
        ? options.openImport
        : false;
    state.workspaceMode = normalized;
    syncWorkspaceUi();
    if (normalized === "arcade") {
      if (ui.importModal?.classList.contains("open")) closeImportModal();
      if (previousMode !== "arcade") newGame();
      return;
    }
    if (shouldOpenImport) {
      openImportModal();
      return;
    }
    if (ui.importModal?.classList.contains("open")) {
      closeImportModal();
    }
  }

  function applyInitialWorkspaceMode() {
    const initialMode = getInitialWorkspaceMode();
    setWorkspaceMode(initialMode, {
      openImport: false,
    });
  }

  function openImportModal() {
    ui.importModal.classList.add("open");
    ui.importModal.setAttribute("aria-hidden", "false");
    renderRecentImportSection();
    renderRecentArcadeImportSection();
    renderRandomGameOfTheDaySection();
    ensureRecentImportGames();
    ensureRecentArcadeImportGames();
    ensureRandomGameOfTheDay();
    requestAnimationFrame(() => ui.importInput?.focus());
  }

  function closeImportModal() {
    ui.importModal.classList.remove("open");
    ui.importModal.setAttribute("aria-hidden", "true");
  }

  function closeExportModal() {
    ui.exportModal.classList.remove("open");
    ui.exportModal.setAttribute("aria-hidden", "true");
  }

  async function submitImportModal() {
    const value = ui.importInput?.value?.trim() || "";
    if (!value) {
      state.engineStatus = "Import failed";
      state.engineHint = "Paste a PGN or FEN to import";
      renderEngineStatus();
      ui.importInput?.focus();
      return;
    }
    const imported = await loadFenOrPgnText(value);
    if (!imported) return;
    closeImportModal();
  }

  function formatRecentImportResult(result) {
    if (result === "win") return "Won";
    if (result === "loss") return "Lost";
    return "Drew";
  }

  function formatRecentImportColor(color) {
    return color === "white" ? "White" : "Black";
  }

  function formatRecentImportPlayedAt(timestamp) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return "Recent";
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(timestamp));
    } catch (_) {
      return "Recent";
    }
  }

  function renderRecentImportSection() {
    if (!ui.importRecentList) return;

    const stateKey = state.recentImportState;

    if (stateKey === "loading") {
      ui.importRecentList.innerHTML = `
        <div class="import-recent-empty">
          <p>Loading recent games from your linked profile…</p>
        </div>
      `;
      return;
    }

    if (stateKey === "signed-out") {
      ui.importRecentList.innerHTML = `
        <div class="import-recent-empty">
          <p>Sign in to load recent games from your linked chess profile.</p>
          <a class="btn primary" href="${escapeHtml(state.recentImportSignInHref)}">Sign In</a>
        </div>
      `;
      return;
    }

    if (stateKey === "missing-profile") {
      ui.importRecentList.innerHTML = `
        <div class="import-recent-empty">
          <p>Link a public Lichess or Chess.com username first, then your recent games will appear here.</p>
          <a class="btn" href="${escapeHtml(state.recentImportAccountHref)}">Open Account</a>
        </div>
      `;
      return;
    }

    if (stateKey === "error") {
      ui.importRecentList.innerHTML = `
        <div class="import-recent-empty">
          <p>${escapeHtml(state.recentImportMessage || "Recent games could not be loaded right now.")}</p>
          <button class="btn" type="button" data-recent-refresh="true">Try Again</button>
        </div>
      `;
      return;
    }

    if (stateKey !== "ready" || !state.recentImportGames.length) {
      ui.importRecentList.innerHTML = `
        <div class="import-recent-empty">
          <p>No recent importable games were found for this linked profile yet.</p>
        </div>
      `;
      return;
    }

    ui.importRecentList.innerHTML = state.recentImportGames
      .map((game) => {
        const title = game.openingName || `vs ${game.opponentName}`;
        const meta = [
          `vs ${game.opponentName}`,
          formatRecentImportColor(game.userColor),
          formatRecentImportResult(game.result),
        ].join(" • ");
        const sub = [game.providerLabel, game.timeLabel, formatRecentImportPlayedAt(game.playedAtMs)]
          .filter(Boolean)
          .join(" • ");

        return `
          <button
            type="button"
            class="import-recent-game"
            data-recent-game-id="${escapeHtml(game.id)}"
            title="Import this game"
          >
            <span class="import-recent-game-top">
              <span class="import-recent-game-title">${escapeHtml(title)}</span>
              <span class="import-recent-game-action">Import</span>
            </span>
            <span class="import-recent-game-meta">${escapeHtml(meta)}</span>
            <span class="import-recent-game-sub">${escapeHtml(sub)}</span>
          </button>
        `;
      })
      .join("");
  }

  function renderRecentArcadeImportSection() {
    if (!ui.importArcadeList) return;

    const stateKey = state.recentArcadeImportState;

    if (stateKey === "loading") {
      ui.importArcadeList.innerHTML = `
        <div class="import-recent-empty">
          <p>Loading recent Arcade runs…</p>
        </div>
      `;
      return;
    }

    if (stateKey === "signed-out") {
      ui.importArcadeList.innerHTML = `
        <div class="import-recent-empty">
          <p>Sign in to import one of your saved Arcade runs.</p>
          <a class="btn primary" href="${escapeHtml(state.recentImportSignInHref)}">Sign In</a>
        </div>
      `;
      return;
    }

    if (stateKey === "error") {
      ui.importArcadeList.innerHTML = `
        <div class="import-recent-empty">
          <p>${escapeHtml(state.recentArcadeImportMessage || "Recent Arcade games could not be loaded right now.")}</p>
          <button class="btn" type="button" data-arcade-refresh="true">Try Again</button>
        </div>
      `;
      return;
    }

    if (stateKey !== "ready" || !state.recentArcadeImportGames.length) {
      ui.importArcadeList.innerHTML = `
        <div class="import-recent-empty">
          <p>No standard-rules Arcade games have been saved yet.</p>
        </div>
      `;
      return;
    }

    ui.importArcadeList.innerHTML = state.recentArcadeImportGames
      .map((game) => {
        const variant = ARCADE_VARIANTS[game.variantKey] || ARCADE_VARIANTS.vanilla;
        const playedAtMs = Date.parse(String(game.lastPlayedAt || ""));
        const sub = [
          variant.label,
          formatRecentImportPlayedAt(
            Number.isFinite(playedAtMs) ? playedAtMs : 0,
          ),
        ]
          .filter(Boolean)
          .join(" • ");

        return `
          <button
            type="button"
            class="import-recent-game"
            data-arcade-import-id="${escapeHtml(game.id)}"
            title="Import this Arcade game"
          >
            <span class="import-recent-game-top">
              <span class="import-recent-game-title">${escapeHtml(variant.title)}</span>
              <span class="import-recent-game-action">Import</span>
            </span>
            <span class="import-recent-game-meta">${escapeHtml(
              game.currentFen === START_FEN
                ? "Fresh board saved"
                : "Saved position ready for analysis",
            )}</span>
            <span class="import-recent-game-sub">${escapeHtml(sub)}</span>
          </button>
        `;
      })
      .join("");
  }

  function renderRandomGameOfTheDaySection() {
    if (!ui.importRandomGameList) return;

    const stateKey = state.randomGameOfTheDayState;

    if (stateKey === "idle" || stateKey === "loading") {
      ui.importRandomGameList.innerHTML = `
        <div class="import-recent-empty">
          <p>Loading random game of the day…</p>
        </div>
      `;
      return;
    }

    if (stateKey === "error") {
      ui.importRandomGameList.innerHTML = `
        <div class="import-recent-empty">
          <p>${escapeHtml(state.randomGameOfTheDayMessage || "Game of the day could not be loaded.")}</p>
          <button class="btn" type="button" data-random-game-refresh="true">Try Again</button>
        </div>
      `;
      return;
    }

    if (stateKey !== "ready" || !state.randomGameOfTheDayGame) {
      ui.importRandomGameList.innerHTML = `
        <div class="import-recent-empty">
          <p>No game of the day available.</p>
        </div>
      `;
      return;
    }

    const game = state.randomGameOfTheDayGame;
    const title = game.title || "Game of the Day";
    const meta = game.players || "";
    const sub = game.date || "";

    ui.importRandomGameList.innerHTML = `
      <button
        type="button"
        class="import-recent-game"
        data-random-game-gid="${escapeHtml(game.gid)}"
        title="Import this game"
      >
        <span class="import-recent-game-top">
          <span class="import-recent-game-title">${escapeHtml(title)}</span>
          <span class="import-recent-game-action">Import</span>
        </span>
        <span class="import-recent-game-meta">${escapeHtml(meta)}</span>
        <span class="import-recent-game-sub">${escapeHtml(sub)}</span>
      </button>
    `;
  }

  async function ensureRecentImportGames(force = false) {
    const isFresh =
      state.recentImportState !== "idle" &&
      Date.now() - state.recentImportFetchedAt < RECENT_IMPORT_CACHE_MS;
    if (!force && isFresh) {
      renderRecentImportSection();
      return state.recentImportGames;
    }
    if (state.recentImportPromise) return state.recentImportPromise;

    state.recentImportState = "loading";
    renderRecentImportSection();

    let requestPromise = null;
    requestPromise = fetchJsonWithRetry(
      "/api/analyze/recent-games",
      {
        credentials: "same-origin",
        cache: "no-store",
      },
      {
        attempts: 3,
        retryStatuses: [404],
        retryOnInvalidJson: true,
        retryDelayMs: 300,
      },
    )
      .then(async ({ response, payload }) => {
        const data = payload;
        if (!data || typeof data !== "object") {
          throw new Error("Recent games response was invalid.");
        }
        if (!response.ok && data.status !== "error") {
          throw new Error(`Recent games request failed: ${response.status}`);
        }

        state.recentImportFetchedAt = Date.now();
        state.recentImportGames = [];
        state.recentImportMessage = "";
        state.recentImportProfileLabel = "";

        switch (data.status) {
          case "signed-out":
            state.recentImportState = "signed-out";
            state.recentImportSignInHref =
              typeof data.signInHref === "string"
                ? data.signInHref
                : state.recentImportSignInHref;
            break;
          case "missing-profile":
            state.recentImportState = "missing-profile";
            state.recentImportAccountHref =
              typeof data.accountHref === "string"
                ? data.accountHref
                : state.recentImportAccountHref;
            break;
          case "ok":
            state.recentImportState = "ready";
            state.recentImportGames = Array.isArray(data.games)
              ? data.games.filter(
                  (game) =>
                    game &&
                    typeof game.id === "string" &&
                    typeof game.pgn === "string",
                )
              : [];
            state.recentImportProfileLabel =
              data.profile &&
              typeof data.profile.providerLabel === "string" &&
              typeof data.profile.username === "string"
                ? `${data.profile.providerLabel} · ${data.profile.username}`
                : "";
            break;
          default:
            state.recentImportState = "error";
            state.recentImportMessage =
              typeof data.message === "string"
                ? data.message
                : "Recent games could not be loaded right now.";
            break;
        }

        renderRecentImportSection();
        return state.recentImportGames;
      })
      .catch((error) => {
        console.warn("Recent import games failed", error);
        state.recentImportFetchedAt = Date.now();
        state.recentImportState = "error";
        state.recentImportGames = [];
        state.recentImportMessage =
          error instanceof Error && error.message
            ? error.message
            : "Recent games could not be loaded right now.";
        renderRecentImportSection();
        return [];
      })
      .finally(() => {
        if (state.recentImportPromise === requestPromise) {
          state.recentImportPromise = null;
        }
      });

    state.recentImportPromise = requestPromise;
    return requestPromise;
  }

  async function ensureRecentArcadeImportGames(force = false) {
    const isFresh =
      state.recentArcadeImportState !== "idle" &&
      Date.now() - state.recentArcadeImportFetchedAt < RECENT_IMPORT_CACHE_MS;
    if (!force && isFresh) {
      renderRecentArcadeImportSection();
      return state.recentArcadeImportGames;
    }
    if (state.recentArcadeImportPromise) return state.recentArcadeImportPromise;

    state.recentArcadeImportState = "loading";
    renderRecentArcadeImportSection();

    let requestPromise = null;
    requestPromise = fetchJsonWithRetry(
      "/api/analyze/recent-arcade-games",
      {
        credentials: "same-origin",
        cache: "no-store",
      },
      {
        attempts: 3,
        retryStatuses: [404],
        retryOnInvalidJson: true,
        retryDelayMs: 300,
      },
    )
      .then(async ({ response, payload }) => {
        const data = payload;
        if (!data || typeof data !== "object") {
          throw new Error("Recent Arcade games response was invalid.");
        }
        if (!response.ok && data.status !== "error") {
          throw new Error(`Recent Arcade games request failed: ${response.status}`);
        }

        state.recentArcadeImportFetchedAt = Date.now();
        state.recentArcadeImportGames = [];
        state.recentArcadeImportMessage = "";

        switch (data.status) {
          case "signed-out":
            state.recentArcadeImportState = "signed-out";
            state.recentImportSignInHref =
              typeof data.signInHref === "string"
                ? data.signInHref
                : state.recentImportSignInHref;
            break;
          case "ok":
            state.recentArcadeImportState = "ready";
            state.recentArcadeImportGames = Array.isArray(data.games)
              ? data.games.filter(
                  (game) =>
                    game &&
                    typeof game.id === "string" &&
                    typeof game.variantKey === "string",
                )
              : [];
            break;
          default:
            state.recentArcadeImportState = "error";
            state.recentArcadeImportMessage =
              typeof data.message === "string"
                ? data.message
                : "Recent Arcade games could not be loaded right now.";
            break;
        }

        renderRecentArcadeImportSection();
        return state.recentArcadeImportGames;
      })
      .catch((error) => {
        console.warn("Recent Arcade import games failed", error);
        state.recentArcadeImportFetchedAt = Date.now();
        state.recentArcadeImportState = "error";
        state.recentArcadeImportGames = [];
        state.recentArcadeImportMessage =
          error instanceof Error && error.message
            ? error.message
            : "Recent Arcade games could not be loaded right now.";
        renderRecentArcadeImportSection();
        return [];
      })
      .finally(() => {
        if (state.recentArcadeImportPromise === requestPromise) {
          state.recentArcadeImportPromise = null;
        }
      });

    state.recentArcadeImportPromise = requestPromise;
    return requestPromise;
  }

  const RANDOM_GAME_CACHE_MS = 60 * 60 * 1000; // 1 hour cache

  async function ensureRandomGameOfTheDay(force = false) {
    const isFresh =
      state.randomGameOfTheDayState !== "idle" &&
      Date.now() - state.randomGameOfTheDayFetchedAt < RANDOM_GAME_CACHE_MS;
    if (!force && isFresh) {
      renderRandomGameOfTheDaySection();
      return;
    }
    if (state.randomGameOfTheDayPromise) return state.randomGameOfTheDayPromise;

    state.randomGameOfTheDayState = "loading";
    renderRandomGameOfTheDaySection();

    let requestPromise = null;
    requestPromise = fetchJsonWithRetry(
      "/api/analyze/random-game-of-the-day",
      {
        credentials: "same-origin",
        cache: "no-store",
      },
      {
        attempts: 2,
        retryStatuses: [404, 500],
        retryOnInvalidJson: true,
        retryDelayMs: 300,
      },
    )
      .then(async ({ response, payload }) => {
        const data = payload;
        if (!data || typeof data !== "object") {
          throw new Error("Game of the day response was invalid.");
        }
        if (!response.ok && data.status !== "error") {
          throw new Error(`Game of the day request failed: ${response.status}`);
        }

        state.randomGameOfTheDayFetchedAt = Date.now();

        if (data.status === "error" || !data.game) {
          state.randomGameOfTheDayState = "error";
          state.randomGameOfTheDayMessage =
            typeof data.message === "string"
              ? data.message
              : "Game of the day could not be loaded.";
          state.randomGameOfTheDayGame = null;
        } else {
          state.randomGameOfTheDayState = "ready";
          state.randomGameOfTheDayGame = {
            gid: data.game.gid,
            title: data.game.title,
            players: data.game.players,
            pgn: data.game.pgn,
            date: data.game.date,
          };
        }

        renderRandomGameOfTheDaySection();
        return state.randomGameOfTheDayGame;
      })
      .catch((error) => {
        console.warn("Random game of the day failed", error);
        state.randomGameOfTheDayFetchedAt = Date.now();
        state.randomGameOfTheDayState = "error";
        state.randomGameOfTheDayGame = null;
        state.randomGameOfTheDayMessage =
          error instanceof Error && error.message
            ? error.message
            : "Game of the day could not be loaded.";
        renderRandomGameOfTheDaySection();
        return null;
      })
      .finally(() => {
        if (state.randomGameOfTheDayPromise === requestPromise) {
          state.randomGameOfTheDayPromise = null;
        }
      });

    state.randomGameOfTheDayPromise = requestPromise;
    return requestPromise;
  }

  async function importRecentGame(gameId) {
    const game = state.recentImportGames.find((entry) => entry.id === gameId);
    if (!game?.pgn) {
      state.engineStatus = "Import failed";
      state.engineHint = "That recent game could not be imported.";
      renderEngineStatus();
      return;
    }
    const imported = await loadFenOrPgnText(game.pgn);
    if (!imported) return;
    const recentMetadata = playerMetadataFromPgnText(game.pgn);
    setImportedPlayerIdentity(
      recentMetadata.whiteName,
      recentMetadata.blackName,
      recentMetadata.whiteRating,
      recentMetadata.blackRating,
    );
    setPlayerNames(
      recentMetadata.whiteName || state.whitePlayerName || "White",
      recentMetadata.blackName || state.blackPlayerName || "Black",
    );
    setPlayerRatings(
      recentMetadata.whiteRating || state.whitePlayerRating || "",
      recentMetadata.blackRating || state.blackPlayerRating || "",
    );
    flipBoardToOrientation(game.userColor === "black" ? "black" : "white");
    renderAll();
    closeImportModal();
  }

  async function importRecentArcadeGame(gameId) {
    const game = state.recentArcadeImportGames.find((entry) => entry.id === gameId);
    if (!game?.id) {
      state.engineStatus = "Import failed";
      state.engineHint = "That Arcade game could not be imported.";
      renderEngineStatus();
      return;
    }

    const response = await fetch(`/api/arcade/games/${encodeURIComponent(game.id)}`, {
      credentials: "same-origin",
      cache: "no-store",
    }).catch(() => null);
    const data = response ? await response.json().catch(() => null) : null;
    if (!response?.ok || !data?.state || typeof data.state !== "object") {
      state.engineStatus = "Import failed";
      state.engineHint =
        data?.error || "That Arcade game could not be imported right now.";
      renderEngineStatus();
      return;
    }

    const restoredBoard = restoreBoardStatePayload(data.state, {
      restoreChat: false,
    });
    if (!restoredBoard) {
      state.engineStatus = "Import failed";
      state.engineHint = "That Arcade save could not be restored.";
      renderEngineStatus();
      return;
    }

    resetAssistantSession();
    state.arcadeThinking = false;
    state.selectedSquare = null;
    clearPlayerClockMap();
    invalidateGameCache();
    invalidateLegalUciSetCache();
    invalidateHistoryRenderCache();
    invalidateEvalChartRenderCache();
    resetAnalysisCaches();
    loadPersistedAnalysisCaches();
    clearAnalysisForNewPosition();
    const restored = restoreBestCachedAnalysisForCurrentPosition();
    const reusableCache = restored && hasReusableCachedAnalysisForCurrentPosition();
    refreshPieceAnalysisCache();
    refreshOpeningData();
    setWorkspaceMode("explore");
    renderAll();
    if (reusableCache) {
      holdCachedAnalysisResult();
    } else {
      restartSearchIfNeeded();
    }
    closeImportModal();
  }

  async function importRandomGameOfTheDay() {
    const game = state.randomGameOfTheDayGame;
    if (!game?.pgn) {
      state.engineStatus = "Import failed";
      state.engineHint = "That game could not be imported.";
      renderEngineStatus();
      return;
    }

    const imported = await loadFenOrPgnText(game.pgn);
    if (!imported) return;

    state.engineStatus = "Game imported";
    state.engineHint = "Game of the day loaded for analysis.";
    renderEngineStatus();
    closeImportModal();
  }

  function pathToNode(node) {
    const path = [];
    let cursor = node;
    while (cursor) {
      path.unshift(cursor);
      cursor = cursor.parent;
    }
    return path;
  }

  function currentUciPath() {
    return currentMoveNodes()
      .map((node) => node.uci)
      .filter(Boolean)
      .join(",");
  }

  function primeOpeningBook() {
    ensureOpeningBookLoaded().catch(() => {});
  }

  async function ensureOpeningBookLoaded() {
    if (_openingBookMoves && _openingBookNames) {
      return { moves: _openingBookMoves, names: _openingBookNames };
    }
    if (_openingBookPromise) return _openingBookPromise;
    _openingBookPromise = fetch(OPENING_BOOK_URL)
      .then((response) => {
        if (!response.ok)
          throw new Error(`Opening book load failed: ${response.status}`);
        return response.json();
      })
      .then((data) => {
        _openingBookMoves = data?.m && typeof data.m === "object" ? data.m : {};
        _openingBookNames = data?.n && typeof data.n === "object" ? data.n : {};
        _openingBookVersion += 1;
        return { moves: _openingBookMoves, names: _openingBookNames };
      })
      .catch((error) => {
        console.warn("Opening book load failed", error);
        _openingBookMoves = {};
        _openingBookNames = {};
        _openingBookVersion += 1;
        return { moves: _openingBookMoves, names: _openingBookNames };
      });
    return _openingBookPromise;
  }

  function openingBookEligible(rootFen = state.root?.fen || START_FEN) {
    return rootFen === START_FEN;
  }

  function fenToOpeningBookKey(fen) {
    const normalizedFen = String(fen || "");
    if (!normalizedFen) return "";
    if (_openingBookFenKeyCache.has(normalizedFen))
      return _openingBookFenKeyCache.get(normalizedFen);
    const game = readOnlyGameForFen(normalizedFen);
    const parts = String(game?.fen?.() || normalizedFen).split(" ");
    if (parts.length < 4) return "";
    if (parts[3] && parts[3] !== "-" && game) {
      const hasLegalEnPassant = game
        .moves({ verbose: true })
        .some((move) => String(move.flags || "").includes("e"));
      if (!hasLegalEnPassant) parts[3] = "-";
    }
    const key = parts.slice(0, 4).join(" ");
    _openingBookFenKeyCache.set(normalizedFen, key);
    trimCacheMap(_openingBookFenKeyCache, 1024);
    return key;
  }

  function openingBookMoveSetForFen(fen) {
    const key = fenToOpeningBookKey(fen);
    if (!key) return new Set();
    if (_openingBookMoveSetCache.has(key))
      return _openingBookMoveSetCache.get(key);
    const moves = String(_openingBookMoves?.[key] || "")
      .split(" ")
      .filter(Boolean);
    const set = new Set(moves);
    _openingBookMoveSetCache.set(key, set);
    trimCacheMap(_openingBookMoveSetCache, 1024);
    return set;
  }

  function openingBookInfoForFen(fen) {
    if (!openingBookEligible()) return null;
    const key = fenToOpeningBookKey(fen);
    if (!key) return null;
    const entry = _openingBookNames?.[key];
    if (!Array.isArray(entry) || !entry[1]) return null;
    return {
      eco: String(entry[0] || ""),
      name: String(entry[1] || ""),
      title: String(entry[1] || ""),
      source: "book",
    };
  }

  function currentOpeningBookInfo() {
    if (!openingBookEligible()) return null;
    const nodes = currentOpeningNodes();
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const info = openingBookInfoForFen(nodes[index].fen);
      if (info) return info;
    }
    return null;
  }

  function openingLookupKey() {
    return `${state.root?.fen || START_FEN}||${currentOpeningUciPath()}`;
  }

  function wikibookSegmentForNode(node) {
    if (!node?.parent) return "";
    const parts = String(node.parent.fen || "").split(" ");
    const turn = parts[1] || "w";
    const fullmove = parseInt(parts[5] || "1", 10);
    return turn === "w"
      ? `${fullmove}. ${node.san}`
      : `${fullmove}...${node.san}`;
  }

  function currentWikibookSegments() {
    return currentOpeningNodes().map(wikibookSegmentForNode).filter(Boolean);
  }

  function wikibookSegmentsForNode(node) {
    return pathToNode(node)
      .slice(1)
      .map(wikibookSegmentForNode)
      .filter(Boolean);
  }

  function cachedOpeningForNode(node) {
    if (!node) return null;
    const path = pathToNode(node);
    for (let index = path.length - 1; index >= 1; index -= 1) {
      const info = openingBookInfoForFen(path[index].fen);
      if (info?.name) return info;
    }
    if (node.id === state.current?.id && state.openingInfo?.name)
      return state.openingInfo;
    return null;
  }

  function renderOpeningDrivenUi() {
    invalidateEvalChartRenderCache();
    renderOpening();
    renderBoard();
    renderEvalChart();
    renderAnalysisFull();
    renderBoardOverlay();
  }

  function refreshOpeningData() {
    const lookupKey = openingLookupKey();
    const rootFen = state.root?.fen || START_FEN;
    const uciPath = currentOpeningUciPath();
    const canUseBook = !!uciPath && openingBookEligible(rootFen);

    if (!canUseBook) {
      state.openingLookupKey = lookupKey;
      state.openingInfo = null;
      state.openingWiki = null;
      state.openingLoading = false;
      state.openingPromise = Promise.resolve(null);
      renderOpeningDrivenUi();
      return state.openingPromise;
    }

    state.openingLookupKey = lookupKey;
    const requestId = ++state.openingRequestId;
    const syncOpeningInfo = canUseBook
      ? currentOpeningBookInfo() || null
      : null;
    console.log("OPENING refresh:start", {
      requestId,
      lookupKey,
      currentFen: state.current?.fen,
      syncOpeningName: syncOpeningInfo?.name,
    });
    state.openingInfo = syncOpeningInfo;
    state.openingWiki = null;
    state.openingLoading =
      canUseBook && !(_openingBookMoves && _openingBookNames);
    renderOpening();

    let openingPromise = null;
    openingPromise = (async () => {
      if (canUseBook) {
        await ensureOpeningBookLoaded();
        if (
          requestId !== state.openingRequestId ||
          lookupKey !== state.openingLookupKey
        )
          return null;
        const asyncBookInfo = currentOpeningBookInfo();
        // Async book result is NOT written to state — the sync value above is authoritative.
        console.log("OPENING async:book", {
          requestId,
          activeRequestId: state.openingRequestId,
          lookupKey,
          activeLookupKey: state.openingLookupKey,
          asyncBookName: asyncBookInfo?.name,
        });
      }
      if (
        requestId !== state.openingRequestId ||
        lookupKey !== state.openingLookupKey
      )
        return null;

      state.openingLoading = false;
      console.log("OPENING async:resolve", {
        requestId,
        activeRequestId: state.openingRequestId,
        lookupKey,
        activeLookupKey: state.openingLookupKey,
        wikiTitle: null,
        currentOpeningName: state.openingInfo?.name,
      });
      renderOpeningDrivenUi();
      return { opening: state.openingInfo, wiki: null };
    })()
      .catch((error) => {
        if (
          requestId === state.openingRequestId &&
          lookupKey === state.openingLookupKey
        ) {
          console.warn("Opening lookup failed", error);
          // On error, clear only the supplemental wiki field; keep the book-derived
          // state.openingInfo intact so the bar title is never blanked by a failure.
          state.openingWiki = null;
          state.openingLoading = false;
          renderOpeningDrivenUi();
        }
        return null;
      })
      .finally(() => {
        if (_openingLookupPromiseCache.get(lookupKey) === openingPromise) {
          _openingLookupPromiseCache.delete(lookupKey);
        }
      });
    _openingLookupPromiseCache.set(lookupKey, openingPromise);
    state.openingPromise = openingPromise;
    return openingPromise;
  }
  async function ensureOpeningDataReady() {
    if (openingLookupKey() !== state.openingLookupKey) refreshOpeningData();
    if (state.openingPromise) await state.openingPromise;
  }

  function isWikibookEligible(rootFen, wikiSegments) {
    return rootFen === START_FEN && wikiSegments.length > 0;
  }

  function wikibooksLookupKey(rootFen, segments) {
    return `${rootFen || START_FEN}||${Array.isArray(segments) ? segments.join("|") : ""}`;
  }

  async function loadWikibooksDataForSegments(rootFen, segments) {
    if (!isWikibookEligible(rootFen, segments)) return null;
    const lookupKey = wikibooksLookupKey(rootFen, segments);
    if (state.openingCache.has(lookupKey)) {
      return state.openingCache.get(lookupKey) || null;
    }
    let lookupPromise = _openingWikiLookupPromiseCache.get(lookupKey) || null;
    if (!lookupPromise) {
      lookupPromise = fetchOpeningFromWikibooksPath(segments)
        .then((result) => {
          state.openingCache.set(lookupKey, result || null);
          return result || null;
        })
        .catch((error) => {
          console.warn("Wikibooks lookup failed", error);
          state.openingCache.set(lookupKey, null);
          return null;
        })
        .finally(() => {
          if (_openingWikiLookupPromiseCache.get(lookupKey) === lookupPromise) {
            _openingWikiLookupPromiseCache.delete(lookupKey);
          }
        });
      _openingWikiLookupPromiseCache.set(lookupKey, lookupPromise);
    }
    return await lookupPromise;
  }

  async function fetchOpeningFromWikibooksPath(segments) {
    for (let index = segments.length; index >= 1; index -= 1) {
      const title = `${WIKIBOOKS_TITLE_PREFIX}/${segments.slice(0, index).join("/").replace(/ /g, "_")}`;
      if (state.wikibookCache.has(title)) {
        const cached = state.wikibookCache.get(title);
        if (cached) return cached;
        continue;
      }
      let fetchPromise = _wikibookFetchPromiseCache.get(title);
      if (!fetchPromise) {
        fetchPromise = (async () => {
          const params = new URLSearchParams({
            titles: title,
            redirects: "1",
            origin: "*",
            action: "query",
            prop: "extracts",
            formatversion: "2",
            format: "json",
          });
          const response = await fetch(
            `${WIKIBOOKS_API_URL}?${params.toString()}`,
          );
          if (!response.ok)
            throw new Error(`Wikibooks lookup failed: ${response.status}`);
          const data = await response.json();
          const page = data?.query?.pages?.[0];
          if (!page || page.missing || page.invalid) {
            state.wikibookCache.set(title, null);
            return null;
          }
          const extract = page?.extract || "";
          const summary = summarizeWikibookExtract(extract);
          const normalizedTitle = page?.title || title.replace(/_/g, " ");
          const name = sanitizeWikibookOpeningName(
            extractWikibookOpeningName(extract, normalizedTitle),
          );
          if (!name) {
            state.wikibookCache.set(title, null);
            return null;
          }
          const result =
            summary || name ? { title: normalizedTitle, summary, name } : null;
          state.wikibookCache.set(title, result);
          return result;
        })().finally(() => {
          if (_wikibookFetchPromiseCache.get(title) === fetchPromise) {
            _wikibookFetchPromiseCache.delete(title);
          }
        });
        _wikibookFetchPromiseCache.set(title, fetchPromise);
      }
      const result = await fetchPromise;
      if (result) return result;
    }
    return null;
  }
  function extractWikibookOpeningName(html, title) {
    if (html) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;
      const heading = wrapper.querySelector("h2");
      const headingText = normalizeInlineText(heading?.textContent || "");
      if (headingText) {
        const parts = headingText
          .split("·")
          .map((part) => normalizeInlineText(part))
          .filter(Boolean)
          .filter((part) => !/^[A-E]\d{2}(?:-\d{2})?$/.test(part))
          .filter((part) => !/^\d+\.(?:\.\.)?\s*\S+/.test(part))
          .filter((part) => !/^\d+\.\S/.test(part));
        const meaningful = parts;
        if (meaningful.length > 1) {
          if (meaningful.length > 1) return meaningful.join(" - ");
          if (meaningful[0]) return meaningful[0];
        }
        if (meaningful[0]) return meaningful[0];
      }
    }
    const cleaned = String(title || "")
      .replace(/^Chess Opening Theory\//i, "")
      .split("/")
      .pop()
      ?.replace(/_/g, " ")
      .trim();
    return cleaned || "";
  }

  function sanitizeWikibookOpeningName(name) {
    const normalized = normalizeInlineText(name || "");
    if (!normalized) return "";
    if (/^\d+\.\s*\.\.\.\s*\S+/.test(normalized)) return "";
    if (/^\d+\.\s*\S+/.test(normalized)) return "";
    if (
      /^(theory table|theory tables|references|reference|bibliography|external links|notes)$/i.test(
        normalized,
      )
    )
      return "";
    return normalized;
  }

  function summarizeWikibookExtract(html) {
    if (!html) return "";
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    const paragraphs = Array.from(wrapper.querySelectorAll("p"))
      .map((p) => normalizeInlineText(p.textContent || ""))
      .filter(Boolean);
    const summary = (
      paragraphs.length
        ? paragraphs.slice(0, 3).join("\n\n")
        : normalizeInlineText(wrapper.textContent || "")
    )
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return summary.length > 1200
      ? `${summary.slice(0, 1197).trimEnd()}...`
      : summary;
  }

  function normalizeInlineText(text) {
    return String(text).replace(/\s+/g, " ").trim();
  }

  function resetAnalysisCaches() {
    _analysisDisplayClassCache.clear();
    state.fenPieceAnalysisCache = new Map();
    state.positionAnalysisCache = new Map();
    state.nextPlyAnalysisCache = new Map();
    state.playedMoveAnalysisCache = new Map();
    state.cacheFenOrder = new Map();
    state.pieceAnalysisCache = new Map();
    state.cachedFullAnalysis = null;
    state.pieceCacheQueue = [];
    state.positionCacheQueue = [];
    state.nextPlyCacheQueue = [];
    state.playedMoveCacheQueue = [];
    state.cacheTaskMap = new Map();
    state.cacheTask = null;
    state.cacheQueueRefreshToken = 0;
    state.awaitingImportedPgnAnalysis = false;
    state.importedPgnReportReady = false;
    state.importedPgnAnalysisFens = [];
    state.importedPgnAnalysisMoves = [];
    state.importedGameReviewMode = false;
    state.importedGameReviewLoading = false;
    state.importedGameReviewComments = new Map();
    state.importedGameReviewLastNodeId = "";
    state.importedGameReviewLastText = "";
    state.importedGameReviewTypewriterText = "";
    if (state.importedGameReviewTypewriterTimer) {
      clearTimeout(state.importedGameReviewTypewriterTimer);
      state.importedGameReviewTypewriterTimer = null;
    }
    if (state.importedGameReviewThinkingTimer) {
      clearTimeout(state.importedGameReviewThinkingTimer);
      state.importedGameReviewThinkingTimer = null;
    }
    state.importedGameReviewThinkingDots = 0;
    clearImportedPgnPlayback(true);
    if (
      state.cacheEngineBusy &&
      state.cacheEngine &&
      !state.cacheStopRequested
    ) {
      state.cacheStopRequested = true;
      sendCacheEngine("stop");
    }
  }

  function serializeAnalysisRow(row) {
    if (!row?.bestUci) return null;
    return {
      u: row.bestUci,
      p: Array.isArray(row.pv) ? row.pv.slice(0, 8) : [],
      d: row.depth || 0,
      n: row.nodes || 0,
      m: row.multipv || 1,
      cp: Number.isFinite(row.scoreCp) ? row.scoreCp : null,
      mt: Number.isFinite(row.mate) ? row.mate : null,
      w:
        row.wdl &&
        Number.isFinite(row.wdl.w) &&
        Number.isFinite(row.wdl.d) &&
        Number.isFinite(row.wdl.l)
          ? [row.wdl.w, row.wdl.d, row.wdl.l]
          : null,
    };
  }

  function deserializeAnalysisRow(raw) {
    if (!raw?.u) return null;
    const scoreCp = Number.isFinite(raw.cp) ? raw.cp : null;
    const mate = Number.isFinite(raw.mt) ? raw.mt : null;
    return {
      bestUci: raw.u,
      pv: Array.isArray(raw.p) ? raw.p.slice(0, 8) : [],
      depth: clampInt(raw.d, 0, 999, 0),
      nodes: Math.max(0, Number(raw.n) || 0),
      multipv: clampInt(raw.m, 1, 99, 1),
      scoreCp,
      mate,
      wdl:
        Array.isArray(raw.w) && raw.w.length === 3
          ? {
              w: Number(raw.w[0]) || 0,
              d: Number(raw.w[1]) || 0,
              l: Number(raw.w[2]) || 0,
            }
          : null,
      evalText: mate ? `#${mate}` : formatEval(scoreCp),
      firstSan: "",
    };
  }

  function serializePositionCacheEntry(entry, fen) {
    if (!entry?.rows?.length || !fen) return null;
    const rows = entry.rows.map(serializeAnalysisRow).filter(Boolean);
    if (!rows.length) return null;
    return {
      fen,
      passMs: Math.max(0, Number(entry.passMs) || 0),
      publishedAt: Math.max(0, Number(entry.publishedAt) || 0),
      publishedDepth: Math.max(0, Number(entry.publishedDepth) || 0),
      rows,
    };
  }

  function serializeNextPlyCacheEntry(entry, fen) {
    if (!entry?.rows?.length || !fen) return null;
    const rows = entry.rows.map(serializeAnalysisRow).filter(Boolean);
    if (!rows.length) return null;
    return {
      fen,
      parentFen: entry.parentFen || "",
      moveUci: entry.moveUci || "",
      passMs: Math.max(0, Number(entry.passMs) || 0),
      publishedAt: Math.max(0, Number(entry.publishedAt) || 0),
      publishedDepth: Math.max(0, Number(entry.publishedDepth) || 0),
      rows,
    };
  }

  function serializePlayedMoveCacheEntry(entry) {
    if (!entry?.fen || !entry?.moveUci || !entry?.complete) return null;
    const payload = {
      fen: entry.fen,
      moveUci: entry.moveUci,
      passMs: Math.max(0, Number(entry.passMs) || 0),
      publishedAt: Math.max(0, Number(entry.publishedAt) || 0),
      publishedDepth: Math.max(0, Number(entry.publishedDepth) || 0),
      complete: true,
    };
    const row = serializeAnalysisRow(entry.row);
    if (row) payload.row = row;
    return payload;
  }

  function deserializePositionCacheEntry(raw) {
    if (!raw?.fen || !Array.isArray(raw.rows)) return null;
    const rows = raw.rows.map(deserializeAnalysisRow).filter(Boolean);
    if (!rows.length) return null;
    return {
      fen: raw.fen,
      map: new Map(rows.map((row) => [row.multipv, { ...row }])),
      rows,
      publishedAt: Math.max(0, Number(raw.publishedAt) || 0),
      publishedDepth: Math.max(0, Number(raw.publishedDepth) || 0),
      passMs: Math.max(0, Number(raw.passMs) || 0),
    };
  }

  function deserializeNextPlyCacheEntry(raw) {
    if (!raw?.fen || !Array.isArray(raw.rows)) return null;
    const rows = raw.rows.map(deserializeAnalysisRow).filter(Boolean);
    if (!rows.length) return null;
    return {
      fen: raw.fen,
      parentFen: raw.parentFen || "",
      moveUci: raw.moveUci || "",
      map: new Map(rows.map((row) => [row.multipv, { ...row }])),
      rows,
      publishedAt: Math.max(0, Number(raw.publishedAt) || 0),
      publishedDepth: Math.max(0, Number(raw.publishedDepth) || 0),
      passMs: Math.max(0, Number(raw.passMs) || 0),
    };
  }

  function deserializePlayedMoveCacheEntry(raw) {
    if (!raw?.fen || !raw?.moveUci || !raw?.complete) return null;
    const row = raw?.row ? deserializeAnalysisRow(raw.row) : null;
    return {
      fen: raw.fen,
      moveUci: raw.moveUci,
      row: row?.bestUci ? row : null,
      publishedAt: Math.max(0, Number(raw.publishedAt) || 0),
      publishedDepth: Math.max(0, Number(raw.publishedDepth) || 0),
      passMs: Math.max(0, Number(raw.passMs) || 0),
      complete: true,
    };
  }

  function deletePlayedMoveAnalysisEntriesForFen(fen) {
    if (!fen) return;
    for (const [key, entry] of state.playedMoveAnalysisCache.entries()) {
      const entryFen = entry?.fen || String(key || "").split("|")[0];
      if (entryFen === fen) state.playedMoveAnalysisCache.delete(key);
    }
  }

  function buildPersistedAnalysisCachePayload() {
    const orderedFens = Array.from(state.cacheFenOrder.keys()).slice(
      -PERSISTED_CACHE_POSITIONS,
    );
    const pinnedFens = [
      START_FEN,
      state.root?.fen || "",
      state.current?.fen || "",
    ].filter(Boolean);
    const orderedSet = new Set(orderedFens);
    pinnedFens.forEach((fen) => {
      if (
        (state.positionAnalysisCache.has(fen) ||
          state.nextPlyAnalysisCache.has(fen)) &&
        !orderedSet.has(fen)
      ) {
        orderedFens.push(fen);
        orderedSet.add(fen);
      }
    });
    const order = [];
    const positions = [];
    const nextply = [];
    const playedMoves = [];
    orderedFens.forEach((fen) => {
      order.push([fen, Number(state.cacheFenOrder.get(fen)) || Date.now()]);
      const positionEntry = serializePositionCacheEntry(
        state.positionAnalysisCache.get(fen),
        fen,
      );
      if (positionEntry) positions.push(positionEntry);
      const nextPlyEntry = serializeNextPlyCacheEntry(
        state.nextPlyAnalysisCache.get(fen),
        fen,
      );
      if (nextPlyEntry) nextply.push(nextPlyEntry);
    });
    state.playedMoveAnalysisCache.forEach((entry) => {
      if (!orderedSet.has(entry?.fen || "")) return;
      const playedMoveEntry = serializePlayedMoveCacheEntry(entry);
      if (playedMoveEntry) playedMoves.push(playedMoveEntry);
    });
    return {
      version: 1,
      savedAt: Date.now(),
      order,
      positions,
      nextply,
      playedMoves,
    };
  }

  function persistAnalysisCaches(force = false) {
    _cachePersistTimer = null;
    _cachePersistIdleHandle = 0;
    if (
      !force &&
      state.engineBusy &&
      Date.now() - state.searchStartedAt < 500
    ) {
      schedulePersistedAnalysisCacheSave(1000);
      return;
    }
    try {
      localStorage.setItem(
        STORAGE.analysisCache,
        JSON.stringify(buildPersistedAnalysisCachePayload()),
      );
    } catch (error) {
      console.warn("Could not persist analysis cache", error);
    }
  }

  function clearPersistedAnalysisCacheSaveSchedule() {
    clearTimeout(_cachePersistTimer);
    _cachePersistTimer = null;
    if (_cachePersistIdleHandle && typeof cancelIdleCallback === "function")
      cancelIdleCallback(_cachePersistIdleHandle);
    _cachePersistIdleHandle = 0;
  }

  function schedulePersistedAnalysisCacheSave(delay = 3000) {
    clearPersistedAnalysisCacheSaveSchedule();
    _cachePersistTimer = setTimeout(() => {
      _cachePersistTimer = null;
      if (typeof requestIdleCallback === "function") {
        _cachePersistIdleHandle = requestIdleCallback(
          () => persistAnalysisCaches(),
          { timeout: 2000 },
        );
        return;
      }
      persistAnalysisCaches();
    }, delay);
  }

  function flushPersistedAnalysisCaches() {
    clearPersistedAnalysisCacheSaveSchedule();
    persistAnalysisCaches(true);
  }

  function loadPersistedAnalysisCaches() {
    try {
      const raw = localStorage.getItem(STORAGE.analysisCache);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1) return;
      state.positionAnalysisCache = new Map();
      state.nextPlyAnalysisCache = new Map();
      state.playedMoveAnalysisCache = new Map();
      state.cacheFenOrder = new Map();
      if (Array.isArray(parsed.positions)) {
        parsed.positions.forEach((entry) => {
          const restored = deserializePositionCacheEntry(entry);
          if (restored) state.positionAnalysisCache.set(restored.fen, restored);
        });
      }
      if (Array.isArray(parsed.nextply)) {
        parsed.nextply.forEach((entry) => {
          const restored = deserializeNextPlyCacheEntry(entry);
          if (restored) state.nextPlyAnalysisCache.set(restored.fen, restored);
        });
      }
      if (Array.isArray(parsed.playedMoves)) {
        parsed.playedMoves.forEach((entry) => {
          const restored = deserializePlayedMoveCacheEntry(entry);
          if (restored)
            state.playedMoveAnalysisCache.set(
              playedMoveAnalysisEntryKey(restored.fen, restored.moveUci),
              restored,
            );
        });
      }
      if (Array.isArray(parsed.order)) {
        parsed.order.slice(-MAX_CACHED_POSITIONS).forEach(([fen, stamp]) => {
          if (!fen) return;
          if (
            !state.positionAnalysisCache.has(fen) &&
            !state.nextPlyAnalysisCache.has(fen)
          )
            return;
          state.cacheFenOrder.set(fen, Math.max(0, Number(stamp) || 0));
        });
      }
      for (const fen of state.positionAnalysisCache.keys()) {
        if (!state.cacheFenOrder.has(fen))
          state.cacheFenOrder.set(fen, Date.now());
      }
      for (const fen of state.nextPlyAnalysisCache.keys()) {
        if (!state.cacheFenOrder.has(fen))
          state.cacheFenOrder.set(fen, Date.now());
      }
      while (state.cacheFenOrder.size > MAX_CACHED_POSITIONS) {
        const oldest = state.cacheFenOrder.keys().next();
        if (oldest.done) break;
        const staleFen = oldest.value;
        state.cacheFenOrder.delete(staleFen);
        state.positionAnalysisCache.delete(staleFen);
        state.nextPlyAnalysisCache.delete(staleFen);
        deletePlayedMoveAnalysisEntriesForFen(staleFen);
      }
    } catch (error) {
      console.warn("Could not load persisted analysis cache", error);
    }
  }

  function touchCachedFen(fen) {
    if (!fen) return;
    state.cacheFenOrder.delete(fen);
    state.cacheFenOrder.set(fen, Date.now());
    while (state.cacheFenOrder.size > MAX_CACHED_POSITIONS) {
      const oldest = state.cacheFenOrder.keys().next();
      if (oldest.done) break;
      const staleFen = oldest.value;
      state.cacheFenOrder.delete(staleFen);
      state.fenPieceAnalysisCache.delete(staleFen);
      state.positionAnalysisCache.delete(staleFen);
      state.nextPlyAnalysisCache.delete(staleFen);
      deletePlayedMoveAnalysisEntriesForFen(staleFen);
    }
    schedulePersistedAnalysisCacheSave();
  }

  function getFenPieceCache(fen) {
    let cache = state.fenPieceAnalysisCache.get(fen);
    if (!cache) {
      cache = new Map();
      state.fenPieceAnalysisCache.set(fen, cache);
    }
    return cache;
  }

  function collectTreeFens(node, seen = new Set(), out = []) {
    if (!node || seen.has(node.fen)) return out;
    seen.add(node.fen);
    out.push(node.fen);
    for (const child of node.children) collectTreeFens(child, seen, out);
    return out;
  }

  function orderedCachedFens() {
    const seen = new Set();
    const out = [];
    const add = (fen) => {
      if (!fen || seen.has(fen)) return;
      seen.add(fen);
      out.push(fen);
    };
    add(state.current?.fen);
    currentPath().forEach((node) => add(node.fen));
    collectTreeFens(state.root).forEach(add);
    return out;
  }

  function importedPgnMoveAnalysisReady(item) {
    if (!item?.parentFen || !item?.moveUci) return true;
    const playedMoveEntry = playedMoveAnalysisEntryForFenAndUci(
      item.parentFen,
      item.moveUci,
    );
    if (playedMoveEntryMeetsCurrentSearchTarget(playedMoveEntry)) return true;
    const positionEntry = state.positionAnalysisCache.get(item.parentFen);
    if (!cachedPositionIsReusable(positionEntry, item.parentFen)) return false;
    const positionRows = sanitizeAnalysisRows(
      positionEntry?.rows || [],
      item.parentFen,
    );
    if (positionRows.some((row) => row.bestUci === item.moveUci)) return true;
    return false;
  }

  function importedPgnAnalysisProgress() {
    const moves = Array.isArray(state.importedPgnAnalysisMoves)
      ? state.importedPgnAnalysisMoves.filter(
          (item) => item?.parentFen && item?.moveUci,
        )
      : [];
    if (!moves.length) return { total: 0, complete: 0, ready: true };
    let complete = 0;
    for (const item of moves) {
      if (importedPgnMoveAnalysisReady(item)) complete += 1;
    }
    return {
      total: moves.length,
      complete,
      ready: complete >= moves.length,
    };
  }

  function updateImportedPgnAnalysisState() {
    const progress = importedPgnAnalysisProgress();
    const pending = progress.total > 0 && !progress.ready;
    state.awaitingImportedPgnAnalysis = pending;
    if (!pending && progress.total) {
      state.importedPgnReportReady = true;
      state.importedPgnAnalysisFens = [];
      state.importedPgnAnalysisMoves = [];
      clearImportedPgnPlayback(true);
      persistAnalysisCaches(true); // Persist all cached analysis when PGN import analysis completes
    }
    return progress;
  }

  function pieceCacheKeyForGame(game = currentGame()) {
    return game.fen();
  }

  function groupLegalMovesBySquare(game = currentGame()) {
    const groups = new Map();
    for (const move of weirdhorseLegalMoves(game)) {
      if (!groups.has(move.from)) groups.set(move.from, []);
      groups.get(move.from).push(move);
    }
    return groups;
  }

  function enqueueCacheWorkForFen(
    fen,
    queuedPiece,
    queuedPosition,
    queuedPlayedMove,
  ) {
    const shouldSkipPieceCaching =
      state.awaitingImportedPgnAnalysis &&
      state.importedPgnAnalysisFens.includes(fen);
    const importedMovesForFen = state.awaitingImportedPgnAnalysis
      ? state.importedPgnAnalysisMoves.filter((item) => item?.parentFen === fen)
      : [];
    for (const item of importedMovesForFen) {
      if (importedPgnMoveAnalysisReady(item)) continue;
      const taskId = `${fen}|playedmove|${item.moveUci}|${state.limitKind}|${state.limitValue}`;
      if (queuedPlayedMove.has(taskId)) continue;
      queuedPlayedMove.add(taskId);
      state.playedMoveCacheQueue.push({
        type: "playedmove",
        fen,
        moveUci: item.moveUci,
        searchKind: state.limitKind,
        passMs: state.limitKind === "time" ? POSITION_CACHE_MOVETIME : 0,
        targetDepth: state.limitKind === "depth" ? state.limitValue : 0,
        multiPv: 1,
      });
    }
    if (!shouldSkipPieceCaching) {
      const fenGame = new Chess(fen);
      const fenPieceCache = getFenPieceCache(fen);
      const groups = groupLegalMovesBySquare(fenGame);
      for (const [square, moves] of groups.entries()) {
        const existing = fenPieceCache.get(square);
        for (const passMs of PIECE_CACHE_PASSES) {
          if (existing && (existing.passMs || 0) >= passMs) continue;
          const taskId = `${fen}|${square}|${passMs}`;
          if (queuedPiece.has(taskId)) continue;
          queuedPiece.add(taskId);
          state.pieceCacheQueue.push({
            type: "piece",
            key: fen,
            fen,
            square,
            passMs,
            moves: moves.map(
              (move) => move.from + move.to + (move.promotion || ""),
            ),
          });
        }
      }
    }
    const positionEntry = state.positionAnalysisCache.get(fen);
    if (
      !cachedPositionIsReusable(positionEntry, fen) ||
      (state.limitKind !== "depth" &&
        (positionEntry?.passMs || 0) < POSITION_CACHE_MOVETIME)
    ) {
      const taskId = `${fen}|position|${state.limitKind}|${state.limitValue}|${state.linesShown}`;
      if (!queuedPosition.has(taskId)) {
        queuedPosition.add(taskId);
        state.positionCacheQueue.push({
          type: "position",
          fen,
          searchKind: state.limitKind,
          passMs: state.limitKind === "time" ? POSITION_CACHE_MOVETIME : 0,
          targetDepth: state.limitKind === "depth" ? state.limitValue : 0,
          multiPv: state.linesShown,
        });
      }
    }
  }

  function refreshPieceAnalysisCache() {
    const token = ++state.cacheQueueRefreshToken;
    const game = currentGame();
    const key = pieceCacheKeyForGame(game);
    const allFens = orderedCachedFens();
    state.pieceCacheKey = key;
    state.pieceAnalysisCache = getFenPieceCache(key);
    state.cachedFullAnalysis = state.positionAnalysisCache.get(key) || null;
    state.pieceCacheQueue = [];
    state.positionCacheQueue = [];
    state.playedMoveCacheQueue = [];
    const queuedPiece = new Set();
    const queuedPosition = new Set();
    const queuedPlayedMove = new Set();

    if (allFens.length)
      enqueueCacheWorkForFen(
        allFens[0],
        queuedPiece,
        queuedPosition,
        queuedPlayedMove,
      );
    if (allFens.length > 1) {
      setTimeout(() => {
        if (token !== state.cacheQueueRefreshToken) return;
        for (const fen of allFens.slice(1))
          enqueueCacheWorkForFen(
            fen,
            queuedPiece,
            queuedPosition,
            queuedPlayedMove,
          );
        maybeStartPieceCacheTask();
      }, 0);
    }
    if (
      state.cacheEngineBusy &&
      state.cacheEngine &&
      !state.cacheStopRequested
    ) {
      state.cacheStopRequested = true;
      sendCacheEngine("stop");
      return;
    }
    maybeStartPieceCacheTask();
  }

  function restorePieceAnalysisCache(square) {
    const entry = state.pieceAnalysisCache.get(square);
    if (!entry || entry.key !== state.pieceCacheKey) return false;
    const fen = state.current?.fen || entry.key;
    const rows = sanitizeAnalysisRows(entry.rows, fen, square).map((row) =>
      enrichRowWithPVSan(row, fen),
    );
    if (!rows.length) return false;
    touchCachedFen(state.pieceCacheKey);
    state.analysisMap = new Map(rows.map((row) => [row.multipv, { ...row }]));
    rebuildAnalysisByUci();
    state.analysisRows = rows.map((row) => ({ ...row }));
    state.analysisPublishedAt = entry.publishedAt;
    state.analysisPublishedDepth = rows[0]?.depth || 0;
    state.awaitingFinalAnalysis = false;
    return true;
  }

  function restoreNextPlyAnalysisCache(
    fen = state.current?.fen,
    allowPartial = false,
  ) {
    const entry = state.nextPlyAnalysisCache.get(fen);
    if (!entry || (!allowPartial && !cachedPositionIsReusable(entry, fen)))
      return false;
    const rows = sanitizeAnalysisRows(entry.rows, fen).map((row) =>
      enrichRowWithPVSan(row, fen),
    );
    if (!rows.length) return false;
    touchCachedFen(fen);
    state.analysisMap = new Map(rows.map((row) => [row.multipv, { ...row }]));
    rebuildAnalysisByUci();
    state.analysisRows = rows.map((row) => ({ ...row }));
    state.analysisPublishedAt = entry.publishedAt;
    state.analysisPublishedDepth = rows[0]?.depth || 0;
    state.awaitingFinalAnalysis = false;
    queueNextPlyAnalysis(rows, fen);
    return true;
  }

  function restoreBestCachedAnalysisForCurrentPosition() {
    if (state.selectedSquare)
      return restorePieceAnalysisCache(state.selectedSquare);
    return (
      restoreNextPlyAnalysisCache(state.current?.fen, true) ||
      restoreCachedFullPositionAnalysis(true)
    );
  }

  function hasReusableCachedAnalysisForCurrentPosition() {
    if (state.selectedSquare) return false;
    const fen = state.current?.fen || "";
    if (!fen) return false;
    const nextPlyEntry = state.nextPlyAnalysisCache.get(fen);
    if (cachedPositionIsReusable(nextPlyEntry, fen)) return true;
    const positionEntry =
      state.positionAnalysisCache.get(fen) ||
      ((state.cachedFullAnalysis?.fen || "") === fen
        ? state.cachedFullAnalysis
        : null);
    return cachedPositionIsReusable(positionEntry, fen);
  }

  function holdCachedAnalysisResult() {
    state.pendingSearch = false;
    if (state.engineBusy) {
      state.discardEngineInfo = true;
      if (state.engine && !state.stopRequested) {
        state.stopRequested = true;
        sendEngine("stop");
      }
    }
  }

  function queueNextPlyAnalysis(rows, parentFen = state.current.fen) {
    if (
      !rows.length ||
      !state.cacheEngineReady ||
      state.engineMode === "selfplay"
    )
      return;
    const queued = [];
    const seen = new Set();
    const queuedFens = new Set(state.nextPlyCacheQueue.map((task) => task.fen));
    for (const row of rows.slice(
      0,
      Math.min(rows.length, NEXT_PLY_CACHE_LIMIT),
    )) {
      if (!row?.bestUci) continue;
      const fen = nextFenForUci(parentFen, row.bestUci);
      const existing = fen ? state.nextPlyAnalysisCache.get(fen) : null;
      if (
        !fen ||
        seen.has(fen) ||
        queuedFens.has(fen) ||
        cachedPositionHasEnoughRows(existing, fen)
      )
        continue;
      seen.add(fen);
      if (existing && !cachedPositionHasEnoughRows(existing, fen))
        state.nextPlyAnalysisCache.delete(fen);
      queued.push({
        type: "nextply",
        parentFen,
        fen,
        moveUci: row.bestUci,
        passMs: NEXT_PLY_CACHE_MOVETIME,
        multiPv: state.linesShown,
      });
    }
    if (!queued.length) return;
    state.nextPlyCacheQueue = state.nextPlyCacheQueue.filter(
      (task) => task.parentFen !== parentFen,
    );
    state.nextPlyCacheQueue = queued.concat(state.nextPlyCacheQueue);
    maybeStartPieceCacheTask();
  }

  function dequeuePriorityCacheTask() {
    const currentFen = state.current?.fen || "";
    const currentPositionIndex = state.positionCacheQueue.findIndex(
      (task) => task.fen === currentFen,
    );
    if (currentPositionIndex >= 0)
      return state.positionCacheQueue.splice(currentPositionIndex, 1)[0];
    if (
      state.awaitingImportedPgnAnalysis &&
      state.importedPgnAnalysisFens.length
    ) {
      const importPathIndex = state.positionCacheQueue.findIndex((task) =>
        state.importedPgnAnalysisFens.includes(task.fen),
      );
      if (importPathIndex >= 0)
        return state.positionCacheQueue.splice(importPathIndex, 1)[0];
    }
    const currentPathIndex = state.positionCacheQueue.findIndex((task) =>
      isFenOnCurrentPath(task.fen),
    );
    if (currentPathIndex >= 0)
      return state.positionCacheQueue.splice(currentPathIndex, 1)[0];
    return (
      state.positionCacheQueue.shift() ||
      state.playedMoveCacheQueue.shift() ||
      state.nextPlyCacheQueue.shift() ||
      state.pieceCacheQueue.shift() ||
      null
    );
  }

  function makeRoot(fen, label) {
    nodeRegistry.clear();
    const node = {
      id: `node-${++nodeCounter}`,
      fen: normalizeFen(fen),
      label,
      san: "",
      uci: "",
      parent: null,
      children: [],
      preferredChildId: null,
      mainlineChildId: null,
    };
    nodeRegistry.set(node.id, node);
    return node;
  }

  function createChild(parent, move, fen, options = {}) {
    const child = {
      id: `node-${++nodeCounter}`,
      fen: normalizeFen(fen),
      label: move.san,
      san: move.san,
      uci: move.from + move.to + (move.promotion || ""),
      isCapture: moveRecordIsCapture(move),
      moveClassKey: String(options.moveClassKey || ""),
      parent,
      children: [],
      preferredChildId: null,
      mainlineChildId: null,
    };
    parent.children.push(child);
    if (options.mainline) parent.mainlineChildId = child.id;
    if (options.preferred !== false) parent.preferredChildId = child.id;
    nodeRegistry.set(child.id, child);
    return child;
  }

  function removeNodeSubtreeFromRegistry(node) {
    if (!node) return;
    for (const child of node.children || [])
      removeNodeSubtreeFromRegistry(child);
    nodeRegistry.delete(node.id);
  }

  function normalizeFen(fen) {
    return new Chess(fen).fen();
  }

  function flipBoardToOrientation(targetOrientation) {
    if (targetOrientation !== "white" && targetOrientation !== "black") return;
    if (state.orientation !== targetOrientation) {
      state.orientation = targetOrientation;
      saveSettings();
      renderBoard();
      renderMeta();
    }
  }

  // Flip the board so it shows the perspective of the player who is to move
  // in the given FEN (or the current position if no fen is passed).
  function flipBoardToTurn(fen) {
    const turn = fen
      ? new Chess(fen).turn()
      : new Chess(state.current?.fen).turn();
    flipBoardToOrientation(turn === "b" ? "black" : "white");
  }

  function newGame() {
    state.root = makeRoot(START_FEN, "Start position");
    state.current = state.root;
    if (isArcadeMode()) {
      const variant = currentArcadeVariant();
      setPlayerNames(variant.playerName, variant.aiName);
      setPlayerRatings("", "");
      state.orientation = variant.playerColor;
      state.engineLinesHidden = true;
      resetArcadeDrift();
    } else {
      setPlayerNames("White", "Black");
      setPlayerRatings("", "");
    }
    clearImportedPlayerIdentity();
    clearPlayerClockMap();
    resetAssistantSession();
    invalidateGameCache();
    invalidateLegalUciSetCache();
    invalidateHistoryRenderCache();
    invalidateEvalChartRenderCache();
    state.selectedSquare = null;
    resetAnalysisCaches();
    loadPersistedAnalysisCaches(); // Restore previously cached analysis from localStorage
    clearAnalysisForNewPosition();
    refreshPieceAnalysisCache();
    refreshOpeningData();
    if (isArcadeMode()) {
      haltEngine(false);
      setArcadeStatusForCurrentTurn();
    }
    renderAll();
    if (isArcadeMode()) {
      maybeQueueArcadeAiMove();
      return;
    }
    if (state.engineReady) startAnalysis("analysis");
  }

  function flipBoard() {
    state.orientation = state.orientation === "white" ? "black" : "white";
    saveSettings();
    renderBoard();
    renderMeta();
  }

  function currentPath() {
    const currentId = state.current?.id || "";
    if (_cachedCurrentPath && _cachedCurrentPathNodeId === currentId)
      return _cachedCurrentPath;
    const path = [];
    let node = state.current;
    while (node) {
      path.unshift(node);
      node = node.parent;
    }
    _cachedCurrentPathNodeId = currentId;
    _cachedCurrentPath = path;
    _cachedCurrentPathFenSet = new Set(path.map((node) => node.fen));
    return path;
  }

  function isFenOnCurrentPath(fen) {
    if (!fen) return false;
    if (!_cachedCurrentPathFenSet) currentPath();
    return !!_cachedCurrentPathFenSet?.has(fen);
  }

  function nodeDisplayLabel(node) {
    if (node._displayLabel) return node._displayLabel;
    const parts = String(node.parent.fen || "").split(" ");
    const turn = parts[1] || "w";
    const fullmove = parseInt(parts[5] || "1", 10);
    const prefix = turn === "w" ? `${fullmove}.` : `${fullmove}...`;
    node._displayLabel = `${prefix} ${node.san}`;
    return node._displayLabel;
  }

  function movePanelButtonMarkup(node, options = {}) {
    if (!node) return "";
    const displayNode = currentDisplayNode();
    const moveClass = classificationForHistoryNode(node);
    const color = moveClass?.color || (node.id === displayNode?.id ? "var(--accent)" : "var(--muted-soft)");
    const soft = moveClass?.soft || "var(--app-surface-subtle)";
    const label = node.san || nodeDisplayLabel(node);
    const title = [nodeDisplayLabel(node), moveClass?.label || ""]
      .filter(Boolean)
      .join(" • ");
    const iconClasses = new Set([
      MOVE_CLASS_STYLES.brilliant,
      MOVE_CLASS_STYLES.critical,
      MOVE_CLASS_STYLES.inaccuracy,
      MOVE_CLASS_STYLES.mistake,
      MOVE_CLASS_STYLES.blunder,
    ]);
    const classIcon =
      moveClass && iconClasses.has(moveClass) && moveClass.icon
        ? `<span class="board-history-move-icon" title="${escapeHtml(moveClass.label)}"><img src="${escapeHtml(moveClass.icon)}" alt="${escapeHtml(moveClass.label)} icon"></span>`
        : "";
    return `<button class="board-history-move${node.id === displayNode?.id ? " current" : ""}${options.future ? " future" : ""}" data-node-id="${node.id}" style="--move-class:${escapeHtml(color)};--move-soft:${escapeHtml(soft)}" title="${escapeHtml(title)}"><span class="board-history-move-label">${escapeHtml(label)}</span>${classIcon}</button>`;
  }

  function findNodeById(_node, id) {
    return nodeRegistry.get(id) || null;
  }

  function goToNode(node) {
    if (!node) return;
    if (importedPgnPlaybackActive()) {
      const displayNode = currentDisplayNode();
      if (displayNode && displayNode !== state.current) {
        state.current = displayNode;
        invalidateGameCache();
        invalidateLegalUciSetCache();
        invalidateHistoryRenderCache();
        invalidateEvalChartRenderCache();
      }
      clearImportedPgnPlayback(true);
    }
    const previous = state.current;
    const traversedNode = previous?.parent === node ? previous : node;
    const soundName = traversedNode?.uci
      ? soundNameForNode(traversedNode)
      : null;
    if (previous && node?.parent === previous && node.uci) {
      const moveClass =
        displayedMoveClassForUci(node.uci, currentGame()) ||
        classificationForUciInRows(
          node.uci,
          fullPositionRowsForFen(previous.fen),
          currentGame(),
        );
      const moveClassKey = moveClassKeyForStyle(moveClass);
      if (moveClassKey && node.moveClassKey !== moveClassKey)
        node.moveClassKey = moveClassKey;
    }
    if (node.parent) node.parent.preferredChildId = node.id;
    state.current = node;
    if (soundName) playNamedSound(soundName);
    invalidateGameCache();
    invalidateLegalUciSetCache();
    invalidateHistoryRenderCache();
    invalidateEvalChartRenderCache();
    state.selectedSquare = null;
    clearAnalysisForNewPosition();
    const restored = restoreBestCachedAnalysisForCurrentPosition();
    const reusableCache =
      restored && hasReusableCachedAnalysisForCurrentPosition();
    refreshPieceAnalysisCache();
    refreshOpeningData();
    renderAll();
    if (reusableCache) {
      holdCachedAnalysisResult();
    } else {
      restartSearchIfNeeded();
    }
  }

  function navigateBack() {
    const anchor = importedPgnPlaybackActive()
      ? currentDisplayNode()
      : state.current;
    if (anchor?.parent) goToNode(anchor.parent);
  }
  function navigateForward() {
    const anchor = importedPgnPlaybackActive()
      ? currentDisplayNode()
      : state.current;
    const preferredId =
      anchor?.mainlineChildId || anchor?.preferredChildId;
    const next =
      anchor?.children.find((c) => c.id === preferredId) ||
      anchor?.children[0];
    if (next) goToNode(next);
  }
  function navigateStart() {
    if (state.root) goToNode(state.root);
  }
  function navigateEnd() {
    const path = visibleHistoryPath();
    const target = path[path.length - 1] || state.current;
    if (target && target !== state.current) goToNode(target);
  }
  function navigateSibling(delta) {
    const anchor = importedPgnPlaybackActive()
      ? currentDisplayNode()
      : state.current;
    if (!anchor?.parent) return;
    const siblings = anchor.parent.children;
    const index = siblings.findIndex((c) => c.id === anchor.id);
    const next = siblings[index + delta];
    if (next) goToNode(next);
  }

  function deleteCurrentNode() {
    if (!state.current.parent) return;
    const removedNode = state.current;
    const parent = state.current.parent;
    parent.children = parent.children.filter(
      (child) => child.id !== removedNode.id,
    );
    if (parent.preferredChildId === removedNode.id)
      parent.preferredChildId = parent.children[0]
        ? parent.children[0].id
        : null;
    if (parent.mainlineChildId === removedNode.id)
      parent.mainlineChildId = parent.children[0]
        ? parent.children[0].id
        : null;
    removeNodeSubtreeFromRegistry(removedNode);
    state.current = parent;
    invalidateGameCache();
    invalidateLegalUciSetCache();
    invalidateHistoryRenderCache();
    invalidateEvalChartRenderCache();
    clearAnalysisForNewPosition();
    const restored = restoreBestCachedAnalysisForCurrentPosition();
    const reusableCache =
      restored && hasReusableCachedAnalysisForCurrentPosition();
    refreshPieceAnalysisCache();
    refreshOpeningData();
    renderAll();
    if (reusableCache) {
      holdCachedAnalysisResult();
    } else {
      restartSearchIfNeeded();
    }
  }

  function handleSquareSelection(square) {
    const game = currentGame();
    if (!arcadeHumanCanMove(game)) return;
    const piece = game.get(square);
    if (state.selectedSquare) {
      if (state.selectedSquare === square) {
        state.selectedSquare = null;
        invalidateLegalUciSetCache();
        refreshSelectedPieceAnalysis();
        return;
      }
      const move = uciToLegalMove(game, state.selectedSquare + square + "q");
      if (move) {
        const canonical = move.from + move.to + (move.promotion || "");
        const moveClassKey = moveClassKeyForStyle(
          displayedMoveClassForUci(canonical, game, state.selectedSquare),
        );
        state.selectedSquare = null;
        invalidateLegalUciSetCache();
        applyPrincipalMove(canonical, { moveClassKey });
        return;
      }
      if (piece && piece.color === game.turn()) {
        state.selectedSquare = square;
        invalidateLegalUciSetCache();
        refreshSelectedPieceAnalysis();
        return;
      }
      state.selectedSquare = null;
      invalidateLegalUciSetCache();
      refreshSelectedPieceAnalysis();
      return;
    }
    if (piece && piece.color === game.turn()) {
      state.selectedSquare = square;
      invalidateLegalUciSetCache();
      refreshSelectedPieceAnalysis();
    }
  }

  function applyPrincipalMove(uci, options = {}) {
    const game = currentGame();
    const source = String(options.source || "human");
    if (isArcadeMode() && source !== "arcade-ai" && !arcadeHumanCanMove(game)) {
      return;
    }
    const weirdhorseMove = isWeirdhorseVariant()
      ? weirdhorseCustomMoveForUci(game, uci)
      : null;
    const move = weirdhorseMove || uciToLegalMove(game, uci);
    if (!move) return;
    const canonical = move.from + move.to + (move.promotion || "");
    const forcedMoveClassKey = String(options.moveClassKey || "");
    const moveClass = forcedMoveClassKey
      ? moveClassStyleForKey(forcedMoveClassKey)
      : displayedMoveClassForUci(canonical, game) ||
        classificationForUciInRows(canonical, currentFullPositionRows(), game);
    const moveClassKey = forcedMoveClassKey || moveClassKeyForStyle(moveClass);
    const existing =
      state.current.children.find((child) => child.uci === canonical) || null;
    let playedMove = null;
    let nextFen = existing?.fen || "";
    if (!existing) {
      if (weirdhorseMove) {
        nextFen = buildWeirdhorseFenAfterMove(game, weirdhorseMove) || "";
        if (!nextFen) return;
        playedMove = {
          ...weirdhorseMove,
          promotion: "",
        };
      } else {
        playedMove = game.move(move);
        nextFen = game.fen();
      }
    }
    const soundName = existing
      ? soundNameForNode(existing)
      : soundNameForMoveRecord(playedMove);
    let next = state.current.children.find((child) => child.uci === canonical);
    if (!next)
      next = createChild(state.current, playedMove, nextFen, {
        moveClassKey,
      });
    else {
      state.current.preferredChildId = next.id;
      if (moveClassKey && next.moveClassKey !== moveClassKey)
        next.moveClassKey = moveClassKey;
    }
    state.current = next;
    playNamedSound(soundName);
    invalidateGameCache();
    invalidateLegalUciSetCache();
    invalidateHistoryRenderCache();
    invalidateEvalChartRenderCache();
    state.selectedSquare = null;
    clearAnalysisForNewPosition();
    const restored = restoreBestCachedAnalysisForCurrentPosition();
    const reusableCache =
      restored && hasReusableCachedAnalysisForCurrentPosition();
    refreshPieceAnalysisCache();
    refreshOpeningData();
    renderAll();
    if (isArcadeMode()) {
      setArcadeStatusForCurrentTurn();
      renderMeta();
      renderAssistant();
      renderEngineStatus();
      if (source !== "arcade-ai") {
        maybeQueueArcadeAiMove();
      }
      return;
    }
    autoCoachComment();
    if (reusableCache) {
      holdCachedAnalysisResult();
    } else {
      restartSearchIfNeeded();
    }
  }

  function clearAnalysisForNewPosition(preserveCachedFullAnalysis = false) {
    _analysisDisplayClassCache.clear();
    state.analysisMap.clear();
    analysisByUci.clear();
    state.analysisRows = [];
    state.analysisPublishedAt = 0;
    state.analysisPublishedDepth = 0;
    clearTimeout(state.analysisPublishTimer);
    state.analysisPublishTimer = null;
    state.nextTimedPublishAt = 0;
    state.hoveredUci = null;
    state.awaitingFinalAnalysis =
      state.engineMode === "analysis" && !terminalPositionInfo(currentGame());
    if (!preserveCachedFullAnalysis) state.cachedFullAnalysis = null;
  }

  function refreshSelectedPieceAnalysis() {
    invalidateLegalUciSetCache();
    state.discardEngineInfo = state.engineBusy;
    clearAnalysisForNewPosition(true);
    const restored = state.selectedSquare
      ? restorePieceAnalysisCache(state.selectedSquare)
      : restoreCachedFullPositionAnalysis(true);
    if (restored) holdCachedAnalysisResult();
    renderMeta();
    renderBoard();
    renderAnalysisFull();
    if (state.engineReady) {
      state.pendingOptionSync = true;
      applyUpdatedSearchSettings();
      if (!restored) restartSearchIfNeeded();
    }
  }

  function clearBoardAnnotations() {
    if (!state.annotations.length) return;
    state.annotations = [];
    renderBoardAnnotations();
  }

  function toggleBoardAnnotation(from, to) {
    if (!from || !to) return;
    if (from === to) {
      const existingIndex = state.annotations.findIndex(
        (annotation) =>
          annotation.type === "circle" && annotation.square === from,
      );
      if (existingIndex >= 0) state.annotations.splice(existingIndex, 1);
      else state.annotations.push({ type: "circle", square: from });
      return;
    }
    const existingIndex = state.annotations.findIndex(
      (annotation) =>
        annotation.type === "arrow" &&
        annotation.from === from &&
        annotation.to === to,
    );
    if (existingIndex >= 0) state.annotations.splice(existingIndex, 1);
    else state.annotations.push({ type: "arrow", from, to });
  }

  function coordsToSquare(col, row, orientation) {
    const file = orientation === "white" ? col : 7 - col;
    const rank = orientation === "white" ? 7 - row : row;
    return String.fromCharCode(97 + file) + String(rank + 1);
  }

  function squareToCoords(square, orientation) {
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1], 10) - 1;
    return orientation === "white"
      ? { col: file, row: 7 - rank }
      : { col: 7 - file, row: rank };
  }

  function squareCenter(square) {
    const cache =
      _squareCenterCache[state.orientation] || _squareCenterCache.white;
    if (cache.has(square)) return cache.get(square);
    const pos = squareToCoords(square, state.orientation);
    const center = { x: pos.col * 100 + 50, y: pos.row * 100 + 50 };
    cache.set(square, center);
    return center;
  }

  function arrowHeadPoints(from, to, headLength = 18, headWidth = 16) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.max(Math.hypot(dx, dy), 1);
    const nx = dx / len;
    const ny = dy / len;
    const px = -ny;
    const py = nx;
    const baseX = to.x - nx * headLength;
    const baseY = to.y - ny * headLength;
    const leftX = baseX + px * (headWidth / 2);
    const leftY = baseY + py * (headWidth / 2);
    const rightX = baseX - px * (headWidth / 2);
    const rightY = baseY - py * (headWidth / 2);
    return `${to.x},${to.y} ${leftX},${leftY} ${rightX},${rightY}`;
  }

  function offsetPointTowards(from, to, distance = 0) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.max(Math.hypot(dx, dy), 1);
    return {
      x: from.x + (dx / len) * distance,
      y: from.y + (dy / len) * distance,
    };
  }

  function squareCorner(square, corner = "top-right") {
    const pos = squareToCoords(square, state.orientation);
    const inset = 16;
    const left = pos.col * 100 + inset;
    const right = pos.col * 100 + (100 - inset);
    const top = pos.row * 100 + inset;
    const bottom = pos.row * 100 + (100 - inset);
    switch (corner) {
      case "top-left":
        return { x: left, y: top };
      case "bottom-left":
        return { x: left, y: bottom };
      case "bottom-right":
        return { x: right, y: bottom };
      default:
        return { x: right, y: top };
    }
  }

  function squareFromPointerEvent(event) {
    const rect = ui.boardGrid.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    const col = Math.max(0, Math.min(7, Math.floor((x / rect.width) * 8)));
    const row = Math.max(0, Math.min(7, Math.floor((y / rect.height) * 8)));
    return coordsToSquare(col, row, state.orientation);
  }

  function selectedLegalMoves(game = currentGame()) {
    if (!state.selectedSquare) return [];
    const piece = game.get(state.selectedSquare);
    if (!piece || piece.color !== game.turn()) return [];
    return weirdhorseLegalMoves(game, state.selectedSquare);
  }

  function legalUciSetForGame(game = currentGame()) {
    const weirdhorseKey = isWeirdhorseVariant()
      ? `|horse:${currentWeirdhorseProfile().key}`
      : "";
    const key = `${state.current.fen}|${state.selectedSquare || ""}${weirdhorseKey}`;
    if (_legalUciSetCache && _legalUciSetKey === key) return _legalUciSetCache;
    const moves = state.selectedSquare
      ? selectedLegalMoves(game)
      : weirdhorseLegalMoves(game);
    _legalUciSetKey = key;
    _legalUciSetCache = new Set(
      moves.map((move) => move.from + move.to + (move.promotion || "")),
    );
    return _legalUciSetCache;
  }

  function activeAnalysisLimit(game = currentGame()) {
    return state.selectedSquare
      ? selectedLegalMoves(game).length
      : state.linesShown;
  }

  function effectiveMultiPv(game = currentGame()) {
    return state.selectedSquare
      ? Math.max(1, selectedLegalMoves(game).length)
      : state.linesShown;
  }

  function pieceAsset(piece) {
    const map = { p: "P", n: "N", b: "B", r: "R", q: "Q", k: "K" };
    return pieceThemeAsset(
      state.pieceTheme,
      `${piece.color === "w" ? "w" : "b"}${map[piece.type]}`,
    );
  }

  function squareIndex(square) {
    if (_squareIndexCache.has(square)) return _squareIndexCache.get(square);
    const index = {
      file: square.charCodeAt(0) - 97,
      rank: parseInt(square[1], 10) - 1,
    };
    _squareIndexCache.set(square, index);
    return index;
  }

  function gcd(a, b) {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) [x, y] = [y, x % y];
    return x || 1;
  }

  function rayKey(from, to) {
    const a = squareIndex(from);
    const b = squareIndex(to);
    const df = b.file - a.file;
    const dr = b.rank - a.rank;
    const div = gcd(df, dr);
    return `${df / div}:${dr / div}`;
  }

  function parseUci(uci) {
    if (!uci || !/^[a-h][1-8][a-h][1-8][nbrq]?$/.test(uci)) return null;
    return {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] || "",
    };
  }

  function nextFenForUci(fen, uci) {
    const game = new Chess(fen);
    const move = uciToLegalMove(game, uci);
    if (!move) return null;
    game.move(move);
    return game.fen();
  }

  function uciToLegalMove(game, uci) {
    const parsed = parseUci(uci);
    if (!parsed) return null;
    const tryMove = (promotion) => {
      try {
        const probe = new Chess(game.fen());
        return probe.move({
          from: parsed.from,
          to: parsed.to,
          promotion,
        });
      } catch (_) {
        return null;
      }
    };
    const attempted =
      tryMove(parsed.promotion || undefined) ||
      (parsed.promotion ? tryMove(undefined) : null);
    if (!attempted) return null;
    return {
      from: attempted.from,
      to: attempted.to,
      promotion: attempted.promotion || "",
    };
  }

  function tryLoadFen(text) {
    if (!text) return false;
    try {
      state.root = makeRoot(normalizeFen(text), "Imported FEN");
      state.current = state.root;
      setPlayerNames("White", "Black");
      setPlayerRatings("", "");
      clearImportedPlayerIdentity();
      clearPlayerClockMap();
      state.importedPgnReportReady = false;
      resetAssistantSession();
      invalidateGameCache();
      invalidateLegalUciSetCache();
      invalidateHistoryRenderCache();
      invalidateEvalChartRenderCache();
      state.selectedSquare = null;
      resetAnalysisCaches();
      loadPersistedAnalysisCaches(); // Restore previously cached analysis from localStorage
      clearAnalysisForNewPosition();
      const restored = restoreBestCachedAnalysisForCurrentPosition();
      const reusableCache =
        restored && hasReusableCachedAnalysisForCurrentPosition();
      refreshPieceAnalysisCache();
      refreshOpeningData();
      flipBoardToTurn();
      if (ui.importInput) ui.importInput.value = "";
      renderAll();

      if (reusableCache) {
        holdCachedAnalysisResult();
      } else {
        restartSearchIfNeeded();
      }
      return true;
    } catch (error) {
      state.engineStatus = "Import failed";
      state.engineHint = error.message || String(error);
      renderEngineStatus();
      return false;
    }
  }

  async function requestImportedGameReview(pgnText, importedMoves) {
    return;
  }

  function tryLoadPgn(text) {
    if (!text || !text.trim()) return false;
    try {
      const normalizedText = normalizePgnText(text);
      const setupFen = extractFenHeader(normalizedText) || START_FEN;
      const parser = new Chess(setupFen);
      if (
        !parser.load_pgn(normalizedText, { sloppy: true, newline_char: "\n" })
      )
        throw new Error("PGN could not be parsed");
      const headers =
        typeof parser.header === "function" ? parser.header() : null;
      const parsedWhiteName = readPgnHeaderValue(headers, "White") || "White";
      const parsedBlackName = readPgnHeaderValue(headers, "Black") || "Black";
      const parsedWhiteRating =
        readPgnHeaderValue(headers, "WhiteElo") ||
        readPgnHeaderValue(headers, "WhiteRating") ||
        readPgnHeaderValue(headers, "WhiteUSCF");
      const parsedBlackRating =
        readPgnHeaderValue(headers, "BlackElo") ||
        readPgnHeaderValue(headers, "BlackRating") ||
        readPgnHeaderValue(headers, "BlackUSCF");
      setPlayerNames(
        parsedWhiteName,
        parsedBlackName,
      );
      setPlayerRatings(
        parsedWhiteRating,
        parsedBlackRating,
      );
      setImportedPlayerIdentity(
        parsedWhiteName,
        parsedBlackName,
        parsedWhiteRating,
        parsedBlackRating,
      );
      const pgnClockTags = extractPgnClockTags(normalizedText);
      let whiteClock = normalizeClockDisplay(
        readPgnHeaderValue(headers, "WhiteClock") ||
          readPgnHeaderValue(headers, "ClockWhite"),
      );
      let blackClock = normalizeClockDisplay(
        readPgnHeaderValue(headers, "BlackClock") ||
          readPgnHeaderValue(headers, "ClockBlack"),
      );
      const sanMoves = parser.history();
      const timeoutLoserColor = timeoutLoserColorFromPgn(headers, normalizedText);
      const replay = new Chess(setupFen);
      const rootNode = makeRoot(
        replay.fen(),
        extractFenHeader(normalizedText) ? "PGN setup" : "Imported PGN",
      );
      const nodeClockById = new Map();
      if (whiteClock || blackClock) {
        nodeClockById.set(rootNode.id, {
          white: whiteClock,
          black: blackClock,
        });
      }
      const importedPgnAnalysisMoves = [];
      let cursor = rootNode;
      for (const san of sanMoves) {
        const parentFen = replay.fen();
        const move = replay.move(san, { sloppy: true });
        if (!move) throw new Error(`PGN move could not be replayed: ${san}`);
        const ply = importedPgnAnalysisMoves.length + 1;
        const clockTag = normalizeClockDisplay(pgnClockTags[ply - 1] || "");
        const movingColor =
          String(move.color || "").toLowerCase() === "b" ? "black" : "white";
        if (clockTag) {
          if (movingColor === "white") whiteClock = clockTag;
          else blackClock = clockTag;
        }
        const moveUci = move.from + move.to + (move.promotion || "");
        const moveClassKey = moveClassKeyForFenAndUci(parentFen, moveUci);
        cursor = createChild(cursor, move, replay.fen(), {
          mainline: true,
          moveClassKey,
        });
        if (whiteClock || blackClock) {
          nodeClockById.set(cursor.id, {
            white: whiteClock,
            black: blackClock,
          });
        }
        importedPgnAnalysisMoves.push({
          ply,
          parentFen,
          moveUci,
          nodeId: cursor.id,
        });
      }
      if (cursor && timeoutLoserColor) {
        const finalSnapshot = nodeClockById.get(cursor.id) || {
          white: whiteClock,
          black: blackClock,
        };
        nodeClockById.set(cursor.id, {
          white:
            timeoutLoserColor === "white"
              ? "0:00:00"
              : normalizeClockDisplay(finalSnapshot.white),
          black:
            timeoutLoserColor === "black"
              ? "0:00:00"
              : normalizeClockDisplay(finalSnapshot.black),
        });
      }
      state.root = rootNode;
      // Start imported game review from the first position of the imported game.
      state.current = rootNode;
      resetAssistantSession();
      invalidateGameCache();
      invalidateLegalUciSetCache();
      invalidateHistoryRenderCache();
      invalidateEvalChartRenderCache();
      state.selectedSquare = null;
      resetAnalysisCaches();
      loadPersistedAnalysisCaches(); // Restore previously cached analysis from localStorage
      clearAnalysisForNewPosition();
      const restored = restoreBestCachedAnalysisForCurrentPosition();
      const reusableCache =
        restored && hasReusableCachedAnalysisForCurrentPosition();
      const importedPgnAnalysisFens = [];
      const seenImportedPgnFens = new Set();
      let pathNode = cursor;
      while (pathNode) {
        if (pathNode.fen && !seenImportedPgnFens.has(pathNode.fen)) {
          seenImportedPgnFens.add(pathNode.fen);
          importedPgnAnalysisFens.push(pathNode.fen);
        }
        pathNode = pathNode.parent;
      }
      state.importedPgnAnalysisFens = importedPgnAnalysisFens.reverse();
      state.importedPgnAnalysisMoves = importedPgnAnalysisMoves;
      state.playerClockByNodeId = nodeClockById;
      state.importedGameReviewMode = false;
      state.importedGameReviewLoading = false;
      state.importedGameReviewComments = new Map();
      state.importedGameReviewLastNodeId = "";
      state.importedGameReviewLastText = "";
      state.importedGameReviewTypewriterText = "";
      if (state.importedGameReviewTypewriterTimer) {
        clearTimeout(state.importedGameReviewTypewriterTimer);
        state.importedGameReviewTypewriterTimer = null;
      }
      if (state.importedGameReviewThinkingTimer) {
        clearTimeout(state.importedGameReviewThinkingTimer);
        state.importedGameReviewThinkingTimer = null;
      }
      state.importedGameReviewThinkingDots = 0;
      state.importedPgnReportReady = false;
      state.importPlaybackNodeIds = pathToNode(cursor).map((node) => node.id);
      state.importPlaybackIndex = 0;
      clearTimeout(state.importPlaybackTimer);
      state.importPlaybackTimer = null;
      updateImportedPgnAnalysisState();
      refreshPieceAnalysisCache();
      refreshOpeningData();
      flipBoardToTurn();
      if (ui.importInput) ui.importInput.value = "";
      renderAll();

      syncImportedPgnPlayback(true);
      if (reusableCache) {
        holdCachedAnalysisResult();
      } else {
        restartSearchIfNeeded();
      }
      return true;
    } catch (error) {
      state.engineStatus = "Import failed";
      state.engineHint = error.message || String(error);
      renderEngineStatus();
      return false;
    }
  }

  function normalizePgnText(text) {
    const normalized = String(text || "")
      .replace(/\r\n?/g, "\n")
      .trim();
    const lines = normalized.split("\n");
    let index = 0;
    while (index < lines.length && /^\s*\[/.test(lines[index])) index += 1;
    if (index > 0 && lines[index] !== "") lines.splice(index, 0, "");
    return lines.join("\n");
  }

  function extractFenHeader(text) {
    const match = text.match(/\[FEN\s+"([^"]+)"\]/i);
    return match ? match[1] : "";
  }

  async function importClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) throw new Error("Clipboard is empty");
      return await loadFenOrPgnText(text.trim());
    } catch (error) {
      state.engineStatus = "Clipboard import failed";
      state.engineHint = error.message || "Clipboard access was blocked";
      renderEngineStatus();
      return false;
    }
  }

  function nextPaint() {
    return new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  }

  async function withGlobalImportLoader(label, action) {
    state.importBusy = true;
    state.importLabel = label;
    renderGlobalLoader();
    await nextPaint();
    try {
      return action();
    } finally {
      state.importBusy = false;
      renderGlobalLoader();
    }
  }

  async function loadFenOrPgnText(text) {
    const value = String(text || "").trim();
    if (!value) return false;
    if (looksLikePgn(value)) {
      return await withGlobalImportLoader("Importing PGN", () => tryLoadPgn(value));
    }
    if (looksLikeFen(value)) {
      return await withGlobalImportLoader("Loading FEN", () => tryLoadFen(value));
    }
    return await withGlobalImportLoader("Importing PGN", () => tryLoadPgn(value));
  }

  function looksLikePgn(text) {
    const value = String(text || "").trim();
    if (!value) return false;
    if (/\[[A-Za-z0-9_]+\s+"[^"]*"\]/.test(value)) return true;
    if (/\b\d+\.(\.\.)?/.test(value)) return true;
    if (/(1-0|0-1|1\/2-1\/2|\*)\s*$/.test(value)) return true;
    return false;
  }

  function looksLikeFen(text) {
    const value = String(text || "").trim();
    if (!value || value.includes("\n") || looksLikePgn(value)) return false;
    const parts = value.split(/\s+/);
    if (!(parts.length === 4 || parts.length === 6)) return false;
    if (!value.includes("/")) return false;
    try {
      const game = new Chess();
      return !!game.load(value);
    } catch (_) {
      return false;
    }
  }
  function logInit(step, extra) {
    extra === undefined
      ? console.log(INIT_NS, step)
      : console.log(INIT_NS, step, extra);
  }

  function createEngine() {
    logInit("createEngine:start");
    cancelAnimationFrame(state.searchRaf || 0);
    state.searchRaf = 0;
    clearTimeout(state.analysisPublishTimer);
    if (state.engine) {
      state.engine.terminate();
      state.engine = null;
    }
    if (state.toolEngine) {
      state.toolEngine.terminate();
      state.toolEngine = null;
    }
    state.engineLoading = true;
    state.engineReady = false;
    state.engineBusy = false;
    state.stopRequested = false;
    state.pendingSearch = false;
    state.pendingOptionSync = false;
    state.autoStarted = false;
    state.silentSearchRetries = 0;
    state.nextTimedPublishAt = 0;
    state.analysisPublishTimer = null;
    state.engineRaw = [];
    state.engineStatus = "Loading engine";
    state.engineHint = `Creating ${ENGINE_NAME} worker and starting the UCI handshake...`;
    renderEngineStatus();
    createCacheEngine();
    createToolEngine();
    try {
      state.engine = new Worker(ENGINE_SCRIPT);
      logInit("createEngine:worker-created");
      state.engine.onmessage = handleEngineMessage;
      state.engine.onerror = handleEngineError;
      sendEngine("uci");
      logInit("createEngine:post-uci");
    } catch (error) {
      handleEngineError(error);
    }
  }

  function createCacheEngine() {
    logInit("createCacheEngine:start");
    if (state.cacheEngine) {
      state.cacheEngine.terminate();
      state.cacheEngine = null;
    }
    state.cacheEngineLoading = true;
    state.cacheEngineReady = false;
    state.cacheEngineBusy = false;
    state.cacheStopRequested = false;
    state.cacheTask = null;
    state.cacheTaskMap = new Map();
    try {
      state.cacheEngine = new Worker(ENGINE_SCRIPT);
      logInit("createCacheEngine:worker-created");
      state.cacheEngine.onmessage = handleCacheEngineMessage;
      state.cacheEngine.onerror = handleCacheEngineError;
      sendCacheEngine("uci");
      logInit("createCacheEngine:post-uci");
    } catch (error) {
      handleCacheEngineError(error);
    }
  }

  function createToolEngine() {
    logInit("createToolEngine:start");
    if (state.toolEngine) {
      state.toolEngine.terminate();
      state.toolEngine = null;
    }
    state.toolEngineLoading = true;
    state.toolEngineReady = false;
    state.toolEngineBusy = false;
    state.toolEngineStopRequested = false;
    if (_toolEngineTask?.reject)
      _toolEngineTask.reject(new Error("Tool engine restarted"));
    _toolEngineTask = null;
    try {
      state.toolEngine = new Worker(ENGINE_SCRIPT);
      logInit("createToolEngine:worker-created");
      state.toolEngine.onmessage = handleToolEngineMessage;
      state.toolEngine.onerror = handleToolEngineError;
      sendToolEngine("uci");
      logInit("createToolEngine:post-uci");
    } catch (error) {
      handleToolEngineError(error);
    }
  }

  function handleEngineError(error) {
    console.error(error);
    state.engineLoading = false;
    state.engineReady = false;
    state.engineBusy = false;
    state.engineStatus = "Engine load failed";
    state.engineHint = error && error.message ? error.message : String(error);
    renderEngineStatus();
  }

  function handleCacheEngineError(error) {
    console.warn("Piece cache engine failed", error);
    state.cacheEngineLoading = false;
    state.cacheEngineReady = false;
    state.cacheEngineBusy = false;
    state.cacheStopRequested = false;
    state.cacheTask = null;
  }

  function handleToolEngineError(error) {
    console.warn("Tool engine failed", error);
    state.toolEngineLoading = false;
    state.toolEngineReady = false;
    state.toolEngineBusy = false;
    state.toolEngineStopRequested = false;
    if (_toolEngineTask?.reject)
      _toolEngineTask.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    _toolEngineTask = null;
  }

  function handleEngineMessage(event) {
    for (const line of normalizeEnginePayload(event.data)) {
      if (!line) continue;
      appendEngineRaw(line);
      interpretEngineLine(line);
    }
  }

  function handleCacheEngineMessage(event) {
    for (const line of normalizeEnginePayload(event.data)) {
      if (!line) continue;
      interpretCacheEngineLine(line);
    }
  }

  function handleToolEngineMessage(event) {
    for (const line of normalizeEnginePayload(event.data)) {
      if (!line) continue;
      interpretToolEngineLine(line);
    }
  }

  function normalizeEnginePayload(payload) {
    let text = Array.isArray(payload) ? String(payload[0]) : String(payload);
    text = text.replace(/\s+\|\s+/g, "\n");
    return text
      .split(/\r?\n/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function appendEngineRaw(line) {
    state.engineRaw.push(line);
    if (state.engineRaw.length > 400)
      state.engineRaw.splice(0, state.engineRaw.length - 400);
  }

  function interpretEngineLine(line) {
    if (line.startsWith("Stockfish")) {
      state.engineStatus = "Loading engine";
      state.engineHint = `${ENGINE_NAME} worker connected. Finishing handshake...`;
      renderEngineStatus();
      return;
    }
    if (line.startsWith("id name ")) {
      state.engineStatus = "Loading engine";
      state.engineHint = line.slice(8);
      renderEngineStatus();
      return;
    }
    if (line === "uciok") {
      logInit("engine:uciok");
      syncEngineOptions();
      sendEngine("isready");
      state.engineHint = "Handshake complete. Waiting for readyok...";
      renderEngineStatus();
      return;
    }
    if (line === "readyok") {
      logInit("engine:readyok");
      state.engineLoading = false;
      state.engineReady = true;
      state.engineBusy = false;
      state.stopRequested = false;
      state.engineStatus = "Engine live";
      state.engineHint = `${ENGINE_NAME} is ready. Analysis will auto-start on the current position.`;
      renderEngineStatus();
      if (!state.autoStarted) {
        state.autoStarted = true;
        setTimeout(() => {
          if (isArcadeMode()) {
            state.engineMode = "halt";
            setArcadeStatusForCurrentTurn();
            renderEngineStatus();
            maybeQueueArcadeAiMove();
            return;
          }
          if (
            state.analysisRows.length &&
            !state.awaitingFinalAnalysis &&
            !state.selectedSquare
          ) {
            state.engineMode = "analysis";
            state.terminalAutoHalt = false;
            state.engineStatus = "Engine live";
            state.engineHint =
              "Showing cached analysis for the current position.";
            renderEngineStatus();
            maybeStartPieceCacheTask();
            return;
          }
          startAnalysis("analysis");
        }, 0);
      } else if (state.engineMode !== "halt") launchSearch();
      return;
    }
    if (line.startsWith("info ")) {
      if (state.discardEngineInfo) return;
      let row = parseInfoLine(line);
      if (row) {
        const priorSlotRow = state.analysisMap.get(row.multipv);
        const priorMoveRow = analysisByUci.get(row.bestUci);
        row = hydrateAnalysisRowFromFallback(row, priorSlotRow);
        row = hydrateAnalysisRowFromFallback(row, priorMoveRow);
        state.silentSearchRetries = 0;
        state.analysisMap.set(row.multipv, row);
        analysisByUci.set(row.bestUci, row);
        if (state.engineMode === "analysis" && state.engineReady) {
          state.engineStatus =
            state.limitKind === "infinite"
              ? "Infinite analysis"
              : "Analysis running";
          state.engineHint =
            row.firstSan || row.bestUci || "Receiving engine lines...";
          if (
            state.engineStatus !== _lastRenderedStatus ||
            state.engineHint !== _lastRenderedHint
          )
            renderEngineStatus();
        }
        if (state.limitKind !== "time") publishBufferedAnalysis(false);
      }
      return;
    }
    if (line.startsWith("bestmove ")) {
      handleBestmove(line.split(/\s+/)[1]);
      return;
    }
    if (/^error\b/i.test(line)) {
      state.engineStatus = "Engine warning";
      state.engineHint = line;
      renderEngineStatus();
      console.warn(line);
    }
  }

  function interpretCacheEngineLine(line) {
    if (line === "uciok") {
      syncCacheEngineOptions(1);
      sendCacheEngine("isready");
      return;
    }
    if (line === "readyok") {
      state.cacheEngineLoading = false;
      state.cacheEngineReady = true;
      state.cacheEngineBusy = false;
      state.cacheStopRequested = false;
      maybeStartPieceCacheTask();
      return;
    }
    if (line.startsWith("info ")) {
      if (!state.cacheTask) return;
      const row = parseInfoLine(line, state.cacheTask.fen);
      if (row) state.cacheTaskMap.set(row.multipv, row);
      return;
    }
    if (line.startsWith("bestmove ")) {
      finishPieceCacheTask();
      return;
    }
  }

  function interpretToolEngineLine(line) {
    if (line === "uciok") {
      syncToolEngineOptions(1);
      sendToolEngine("isready");
      return;
    }
    if (line === "readyok") {
      state.toolEngineLoading = false;
      state.toolEngineReady = true;
      state.toolEngineBusy = false;
      state.toolEngineStopRequested = false;
      return;
    }
    if (!_toolEngineTask) return;
    if (line.startsWith("info ")) {
      const row = parseInfoLine(line, _toolEngineTask.fen);
      if (row) _toolEngineTask.rowsByPv.set(row.multipv, row);
      return;
    }
    if (line.startsWith("bestmove ")) {
      const bestmove = line.split(/\s+/)[1] || "";
      const task = _toolEngineTask;
      _toolEngineTask = null;
      state.toolEngineBusy = false;
      state.toolEngineStopRequested = false;
      clearTimeout(task.timeout);
      const rows = normalizeAnalysisRows(
        Array.from(task.rowsByPv.values()).sort(
          (a, b) => a.multipv - b.multipv,
        ),
      )
        .slice(0, task.lines)
        .map((row) => enrichRowWithPVSan(row, task.fen))
        .map((row, index) => ({
          rank: index + 1,
          uci: row.bestUci,
          move: analysisLeadText(row, task.fen),
          continuation: row.restSan || "",
          eval: row.evalText,
          depth: row.depth || 0,
          nodes: row.nodes || 0,
          mate: Number.isFinite(row.mate) ? row.mate : null,
          cp: Number.isFinite(row.scoreCp) ? row.scoreCp : null,
        }));
      task.resolve({
        ok: true,
        fen: task.fen,
        movetime_ms: task.movetimeMs,
        lines_requested: task.lines,
        bestmove,
        rows,
      });
    }
  }

  function syncEngineOptions() {
    if (!state.engine) return;
    sendEngine("setoption name UCI_ShowWDL value true");
    sendEngine(`setoption name Threads value ${state.threads}`);
    sendEngine("setoption name Hash value 16");
    sendEngine(`setoption name MultiPV value ${effectiveMultiPv()}`);
  }

  function syncCacheEngineOptions(multiPv) {
    if (!state.cacheEngine) return;
    sendCacheEngine("setoption name UCI_ShowWDL value true");
    sendCacheEngine(`setoption name Threads value ${state.threads}`);
    sendCacheEngine(`setoption name Hash value ${PIECE_CACHE_HASH}`);
    sendCacheEngine(
      `setoption name MultiPV value ${Math.max(1, multiPv || 1)}`,
    );
  }

  function syncToolEngineOptions(multiPv) {
    if (!state.toolEngine) return;
    sendToolEngine("setoption name UCI_ShowWDL value true");
    sendToolEngine(`setoption name Threads value ${state.threads}`);
    sendToolEngine("setoption name Hash value 12");
    sendToolEngine(`setoption name MultiPV value ${Math.max(1, multiPv || 1)}`);
  }

  function maybeStartPieceCacheTask() {
    if (
      !state.cacheEngineReady ||
      !state.cacheEngine ||
      state.cacheEngineBusy ||
      state.engineMode === "selfplay"
    )
      return;
    const task = dequeuePriorityCacheTask();
    if (!task) return;
    if (task.type === "piece" && !task.moves.length) {
      maybeStartPieceCacheTask();
      return;
    }
    state.cacheTask = task;
    state.cacheTaskMap = new Map();
    state.cacheEngineBusy = true;
    state.cacheStopRequested = false;
    syncCacheEngineOptions(
      task.type === "piece" ? task.moves.length : task.multiPv,
    );
    sendCacheEngine(`position fen ${task.fen}`);
    if (task.type === "piece")
      sendCacheEngine(
        `go movetime ${task.passMs} searchmoves ${task.moves.join(" ")}`,
      );
    else if (task.type === "playedmove")
      sendCacheEngine(
        task.searchKind === "depth"
          ? `go depth ${task.targetDepth} searchmoves ${task.moveUci}`
          : `go movetime ${task.passMs} searchmoves ${task.moveUci}`,
      );
    else if (task.type === "position")
      sendCacheEngine(
        task.searchKind === "depth"
          ? `go depth ${task.targetDepth}`
          : `go movetime ${task.passMs}`,
      );
    else sendCacheEngine(`go movetime ${task.passMs}`);
  }

  function finishPieceCacheTask() {
    const task = state.cacheTask;
    state.cacheEngineBusy = false;
    state.cacheStopRequested = false;
    state.cacheTask = null;
    if (task?.type === "piece") {
      const rows = sanitizeAnalysisRows(
        normalizeAnalysisRows(
          Array.from(state.cacheTaskMap.values()).sort(
            (a, b) => a.multipv - b.multipv,
          ),
        ).slice(0, task.moves.length),
        task.fen,
        task.square,
      ).map((row) => enrichRowWithPVSan(row, task.fen));
      if (rows.length) {
        const entry = {
          key: task.key,
          map: new Map(rows.map((row) => [row.multipv, { ...row }])),
          rows: rows.map((row) => ({ ...row })),
          publishedAt: Date.now(),
          publishedDepth: rows[0]?.depth || 0,
          passMs: task.passMs,
        };
        const fenPieceCache = getFenPieceCache(task.fen);
        fenPieceCache.set(task.square, entry);
        touchCachedFen(task.fen);
        if (state.current?.fen === task.fen)
          state.pieceAnalysisCache = fenPieceCache;
        if (
          state.current?.fen === task.fen &&
          state.selectedSquare === task.square &&
          !state.analysisRows.length
        ) {
          restorePieceAnalysisCache(task.square);
          renderMeta();
          renderAnalysisFull();
          renderBoardOverlay();
        }
      }
    } else if (task?.type === "playedmove") {
      const rows = sanitizeAnalysisRows(
        normalizeAnalysisRows(
          Array.from(state.cacheTaskMap.values()).sort(
            (a, b) => a.multipv - b.multipv,
          ),
        ).slice(0, 1),
        task.fen,
      ).map((row) => enrichRowWithPVSan(row, task.fen));
      const playedMoveRow =
        rows.find((row) => row.bestUci === task.moveUci) || null;
      state.playedMoveAnalysisCache.set(
        playedMoveAnalysisEntryKey(task.fen, task.moveUci),
        {
          fen: task.fen,
          moveUci: task.moveUci,
          row: playedMoveRow ? { ...playedMoveRow } : null,
          publishedAt: Date.now(),
          publishedDepth:
            task.searchKind === "depth"
              ? task.targetDepth || playedMoveRow?.depth || 0
              : playedMoveRow?.depth || 0,
          passMs: task.searchKind === "time" ? task.passMs : 0,
          complete: true,
        },
      );
      touchCachedFen(task.fen);
      const wasAwaitingImportedPgnAnalysis = state.awaitingImportedPgnAnalysis;
      updateImportedPgnAnalysisState();
      if (wasAwaitingImportedPgnAnalysis || state.awaitingImportedPgnAnalysis) {
        syncImportedPgnPlayback();
        if (!state.awaitingImportedPgnAnalysis) {
          refreshPieceAnalysisCache();
          restoreBestCachedAnalysisForCurrentPosition();
        }
        renderMeta();
        renderBoard();
        renderAnalysisFull();
        renderBoardOverlay();
        renderEvalChart();
        renderAssistant();
      }
    } else if (task?.type === "position") {
      const rows = sanitizeAnalysisRows(
        normalizeAnalysisRows(
          Array.from(state.cacheTaskMap.values()).sort(
            (a, b) => a.multipv - b.multipv,
          ),
        ).slice(0, task.multiPv),
        task.fen,
      ).map((row) => enrichRowWithPVSan(row, task.fen));
      if (rows.length) {
        const entry = {
          fen: task.fen,
          map: new Map(rows.map((row) => [row.multipv, { ...row }])),
          rows: rows.map((row) => ({ ...row })),
          publishedAt: Date.now(),
          publishedDepth: rows[0]?.depth || 0,
          passMs: task.searchKind === "time" ? task.passMs : 0,
        };
        state.positionAnalysisCache.set(task.fen, entry);
        touchCachedFen(task.fen);
        queueNextPlyAnalysis(rows, task.fen);
        const wasAwaitingImportedPgnAnalysis =
          state.awaitingImportedPgnAnalysis;
        updateImportedPgnAnalysisState();
        if (
          wasAwaitingImportedPgnAnalysis ||
          state.awaitingImportedPgnAnalysis
        ) {
          syncImportedPgnPlayback();
          if (!state.awaitingImportedPgnAnalysis) {
            refreshPieceAnalysisCache();
            restoreBestCachedAnalysisForCurrentPosition();
          }
          renderMeta();
          renderBoard();
          renderAnalysisFull();
          renderBoardOverlay();
          renderEvalChart();
          renderAssistant();
        }
        if (isFenOnCurrentPath(task.fen)) renderEvalChart();
        if (
          state.current?.fen === task.fen &&
          !state.selectedSquare &&
          !state.analysisRows.length
        ) {
          restoreCachedFullPositionAnalysis();
          renderMeta();
          renderAnalysisFull();
          renderBoardOverlay();
        }
      }
    } else if (task?.type === "nextply") {
      const rows = sanitizeAnalysisRows(
        normalizeAnalysisRows(
          Array.from(state.cacheTaskMap.values()).sort(
            (a, b) => a.multipv - b.multipv,
          ),
        ).slice(0, task.multiPv),
        task.fen,
      ).map((row) => enrichRowWithPVSan(row, task.fen));
      if (rows.length) {
        const entry = {
          fen: task.fen,
          parentFen: task.parentFen,
          moveUci: task.moveUci,
          map: new Map(rows.map((row) => [row.multipv, { ...row }])),
          rows: rows.map((row) => ({ ...row })),
          publishedAt: Date.now(),
          publishedDepth: rows[0]?.depth || 0,
          passMs: task.passMs,
        };
        state.nextPlyAnalysisCache.delete(task.fen);
        state.nextPlyAnalysisCache.set(task.fen, entry);
        touchCachedFen(task.fen);
        if (isFenOnCurrentPath(task.fen)) renderEvalChart();
        if (
          state.current?.fen === task.fen &&
          !state.selectedSquare &&
          !state.analysisRows.length
        ) {
          restoreNextPlyAnalysisCache(task.fen);
          renderMeta();
          renderAnalysisFull();
          renderBoardOverlay();
        }
      }
    }
    state.cacheTaskMap = new Map();
    maybeStartPieceCacheTask();
  }

  function applyUpdatedSearchSettings() {
    state.pendingOptionSync = true;
    if (state.engine && state.engineReady && !state.engineBusy) {
      syncEngineOptions();
      state.pendingOptionSync = false;
    }
    if (state.cacheEngine && state.cacheEngineReady && !state.cacheEngineBusy) {
      syncCacheEngineOptions(1);
    }
    if (state.toolEngine && state.toolEngineReady && !state.toolEngineBusy) {
      syncToolEngineOptions(1);
    }
  }

  function handleBestmove(bestmove) {
    state.engineBusy = false;
    state.stopRequested = false;
    clearAnalysisPublishTimer();
    if (syncTerminalAnalysisState()) return;
    if (state.pendingOptionSync) {
      syncEngineOptions();
      state.pendingOptionSync = false;
    }
    state.awaitingFinalAnalysis = false;
    publishBufferedAnalysis(true);
    if (state.engineMode === "halt") {
      state.engineStatus = "Engine ready";
      state.engineHint = "Press Start analysis or Self-play.";
      renderEngineStatus();
      return;
    }
    if (state.engineMode === "selfplay") {
      if (bestmove && bestmove !== "(none)" && bestmove !== "0000")
        applyPrincipalMove(bestmove);
      if (state.engineMode === "selfplay") queueSearchRestart();
      return;
    }
    if (state.pendingSearch) {
      state.pendingSearch = false;
      launchSearch();
      return;
    }
    if (
      state.engineMode === "analysis" &&
      state.limitKind !== "infinite" &&
      !state.analysisRows.length &&
      state.silentSearchRetries > 0
    ) {
      state.silentSearchRetries -= 1;
      state.engineStatus = "Analysis warming up";
      state.engineHint = `${ENGINE_NAME} finished without a visible line yet. Retrying automatically...`;
      renderEngineStatus();
      queueSearchRestart();
      return;
    }
    if (state.engineMode === "analysis" && state.limitKind !== "infinite") {
      state.engineStatus = "Analysis complete";
      state.engineHint = `Finished ${searchSummaryText()} on the current position.`;
      renderEngineStatus();
      return;
    }
    state.engineStatus = "Engine ready";
    state.engineHint = `${ENGINE_NAME} finished the last search and is ready.`;
    renderEngineStatus();
  }

  function queueSearchRestart() {
    cancelAnimationFrame(state.searchRaf || 0);
    state.searchRaf = requestAnimationFrame(() => {
      state.searchRaf = 0;
      if (state.engineMode !== "halt") launchSearch();
    });
  }

  function clearAnalysisPublishTimer() {
    clearTimeout(state.analysisPublishTimer);
    state.analysisPublishTimer = null;
  }

  function scheduleTimedAnalysisPublish() {
    clearAnalysisPublishTimer();
    if (
      state.engineMode !== "analysis" ||
      state.limitKind !== "time" ||
      !state.engineBusy
    )
      return;
    const target = state.nextTimedPublishAt;
    if (!target) return;
    const delay = Math.max(0, target - Date.now());
    state.analysisPublishTimer = setTimeout(() => {
      state.analysisPublishTimer = null;
      if (
        state.engineMode !== "analysis" ||
        state.limitKind !== "time" ||
        !state.engineBusy
      )
        return;
      publishBufferedAnalysis(false);
      const nextOffset = TIMED_ANALYSIS_PUBLISH_SCHEDULE.find(
        (offset) => state.searchStartedAt + offset > target,
      );
      state.nextTimedPublishAt = nextOffset
        ? state.searchStartedAt + nextOffset
        : 0;
      if (state.nextTimedPublishAt) scheduleTimedAnalysisPublish();
    }, delay);
  }

  function startAnalysis(mode) {
    if (mode === "analysis" && syncTerminalAnalysisState()) return;
    state.engineMode = mode;
    state.terminalAutoHalt = false;
    if (
      mode === "selfplay" &&
      state.cacheEngineBusy &&
      state.cacheEngine &&
      !state.cacheStopRequested
    ) {
      state.cacheStopRequested = true;
      sendCacheEngine("stop");
    }
    if (mode === "analysis") state.silentSearchRetries = 2;
    if (mode === "selfplay") {
      state.engineStatus = "Self-play queued";
      state.engineHint = `${ENGINE_NAME} will self-play with ${formatNodes(state.selfPlayNodes)} nodes per move.`;
    } else {
      state.engineStatus = state.engineReady
        ? "Analysis starting"
        : "Engine loading";
      state.engineHint = state.engineReady
        ? `Launching ${searchSummaryText()}`
        : `Analysis is queued and will start as soon as ${ENGINE_NAME} is ready.`;
    }
    renderEngineStatus();
    if (mode === "analysis") maybeStartPieceCacheTask();
    if (state.engineReady) launchSearch();
  }

  function haltEngine(explicit) {
    cancelAnimationFrame(state.searchRaf || 0);
    state.searchRaf = 0;
    clearAnalysisPublishTimer();
    state.engineMode = "halt";
    state.terminalAutoHalt = false;
    state.pendingSearch = false;
    state.silentSearchRetries = 0;
    state.awaitingFinalAnalysis = false;
    if (state.engineBusy && state.engine && !state.stopRequested) {
      state.stopRequested = true;
      sendEngine("stop");
    }
    state.engineStatus = explicit ? "Halted" : "Engine ready";
    state.engineHint = explicit
      ? "Analysis is stopped. Press Start analysis to resume."
      : `${ENGINE_NAME} is ready.`;
    renderEngineStatus();
    maybeStartPieceCacheTask();
  }

  function restartSearchIfNeeded() {
    if (syncTerminalAnalysisState()) return;
    if (state.terminalAutoHalt && state.engineMode === "halt") {
      state.engineMode = "analysis";
      state.terminalAutoHalt = false;
    }
    if (state.engineMode === "halt" || !state.engineReady) return;
    if (state.engineBusy) {
      state.pendingSearch = true;
      if (!state.stopRequested) {
        state.stopRequested = true;
        sendEngine("stop");
      }
      return;
    }
    // If the current position's analysis is already cached, skip fresh analysis
    const currentFen = state.current?.fen || "";
    if (currentFen && hasReusableCachedAnalysisForCurrentPosition()) {
      state.pendingSearch = false;
      const restored =
        typeof restoreBestCachedAnalysisForCurrentPosition === "function"
          ? restoreBestCachedAnalysisForCurrentPosition()
          : false;
      if (restored && typeof holdCachedAnalysisResult === "function") {
        holdCachedAnalysisResult();
      } else {
        const cachedEntry = state.positionAnalysisCache.get(currentFen);
        state.analysisRows = normalizeAnalysisRows(
          (cachedEntry?.rows || []).map((row) => ({ ...row })),
          currentFen,
        );
        rebuildAnalysisByUci();
        renderAnalysis();
        renderAnalysisFull();
        renderEvalBar();
        renderEvalChart();
      }
      return;
    }
    launchSearch();
  }

  function launchSearch() {
    if (syncTerminalAnalysisState()) return;
    if (!state.engineReady || !state.engine || state.engineBusy) return;
    cancelAnimationFrame(state.searchRaf || 0);
    state.searchRaf = 0;
    clearAnalysisPublishTimer();
    const focusMoves = selectedLegalMoves();
    const command = searchCommand();
    if (!command) return;
    state.analysisMap.clear();
    analysisByUci.clear();
    state.awaitingFinalAnalysis = true;
    state.engineBusy = true;
    state.stopRequested = false;
    state.discardEngineInfo = false;
    state.searchStartedAt = Date.now();
    state.nextTimedPublishAt =
      state.limitKind === "time"
        ? state.searchStartedAt + TIMED_ANALYSIS_PUBLISH_SCHEDULE[0]
        : 0;
    sendEngine(`position fen ${state.current.fen}`);
    sendEngine(command);
    if (state.engineMode === "analysis" && state.limitKind === "time")
      scheduleTimedAnalysisPublish();
    state.engineStatus =
      state.engineMode === "selfplay"
        ? "Self-play running"
        : command === "go infinite"
          ? "Infinite analysis"
          : "Analysis running";
    state.engineHint =
      state.engineMode === "selfplay"
        ? `Searching ${formatNodes(state.selfPlayNodes)} nodes per move.`
        : state.selectedSquare
          ? `Evaluating ${focusMoves.length} legal ${focusMoves.length === 1 ? "move" : "moves"} from ${state.selectedSquare}...`
          : `Waiting for ${ENGINE_NAME} lines...`;
    renderEngineStatus();
  }

  function searchCommand() {
    if (terminalPositionInfo(currentGame())) return "";
    if (state.engineMode === "selfplay")
      return `go nodes ${state.selfPlayNodes}`;
    const focusMoves = selectedLegalMoves();
    if (state.selectedSquare && !focusMoves.length) return "";
    const suffix = state.selectedSquare
      ? ` searchmoves ${focusMoves.map((move) => move.from + move.to + (move.promotion || "")).join(" ")}`
      : "";
    if (state.limitKind === "infinite") return `go infinite${suffix}`;
    if (state.limitKind === "depth")
      return `go depth ${state.limitValue}${suffix}`;
    if (state.limitKind === "nodes")
      return `go nodes ${state.limitValue}${suffix}`;
    return `go movetime ${state.limitValue}${suffix}`;
  }

  function sendEngine(command) {
    if (!state.engine) return;
    state.engine.postMessage(command);
    appendEngineRaw(`> ${command}`);
  }

  function sendCacheEngine(command) {
    if (!state.cacheEngine) return;
    state.cacheEngine.postMessage(command);
  }

  function sendToolEngine(command) {
    if (!state.toolEngine) return;
    state.toolEngine.postMessage(command);
  }

  function parseInfoLine(line, fen = state.current.fen) {
    if (!/\spv\s/.test(line)) return null;
    const tokens = line.trim().split(/\s+/);
    const row = {
      depth: 0,
      nodes: 0,
      multipv: 1,
      scoreCp: null,
      mate: null,
      wdl: null,
      pv: [],
      bestUci: "",
      firstSan: "",
    };
    for (let i = 1; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token === "depth") row.depth = parseInt(tokens[++i] || "0", 10);
      else if (token === "nodes") row.nodes = parseInt(tokens[++i] || "0", 10);
      else if (token === "multipv")
        row.multipv = parseInt(tokens[++i] || "1", 10);
      else if (token === "score") {
        const type = tokens[++i];
        const value = tokens[++i];
        if (type === "cp") row.scoreCp = parseInt(value || "0", 10);
        if (type === "mate") row.mate = parseInt(value || "0", 10);
      } else if (token === "wdl")
        row.wdl = {
          w: parseInt(tokens[++i] || "0", 10),
          d: parseInt(tokens[++i] || "0", 10),
          l: parseInt(tokens[++i] || "0", 10),
        };
      else if (token === "pv") {
        row.pv = tokens.slice(i + 1);
        break;
      }
    }
    if (!row.pv.length) return null;
    row.bestUci = row.pv[0];
    row.firstSan = firstSanForUci(fen, row.bestUci) || row.bestUci;
    row.evalText = row.mate ? `#${row.mate}` : formatEval(row.scoreCp);
    return row;
  }

  function pvToSan(fen, pv) {
    const game = new Chess(fen);
    const out = [];
    for (const uci of pv.slice(0, 8)) {
      const parsed = parseUci(uci);
      if (!parsed) break;
      const fullmove = parseInt(game.fen().split(" ")[5], 10);
      const prefix = game.turn() === "w" ? `${fullmove}.` : `${fullmove}...`;
      let played = null;
      try {
        played = game.move({
          from: parsed.from,
          to: parsed.to,
          promotion: parsed.promotion || undefined,
        });
      } catch (_) {
        played = null;
      }
      if (!played) break;
      out.push(`${prefix} ${played.san}`);
    }
    return out;
  }

  function enrichRowWithPVSan(row, fen) {
    if (!row) return row;
    if (row.restSan !== undefined) return row;
    const sanParts = pvToSan(fen, row.pv || []);
    row.firstSan = sanParts[0] || row.firstSan || row.bestUci;
    row.restSan = sanParts.slice(1).join(" ");
    return row;
  }

  function formatEval(scoreCp) {
    if (scoreCp === null || Number.isNaN(scoreCp)) return "0.0";
    const n = scoreCp / 100;
    return n.toFixed(1);
  }
  function formatNodes(value) {
    const n = Number(value) || 0;
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
    return `${n}`;
  }

  function normalizeAnalysisRows(rows, fen = "") {
    const uniqueRows = dedupeAnalysisRows(rows);
    uniqueRows.sort((a, b) => compareAnalysisRowQuality(b, a));
    return uniqueRows.map((row, index) => ({
      ...row,
      multipv: index + 1,
      evalText: displayAnalysisEvalText(row, fen),
    }));
  }

  function hydrateAnalysisRowFromFallback(row, fallback) {
    if (!row || !fallback || row.bestUci !== fallback.bestUci) return row;
    const merged = { ...row };
    const rowPvLen = merged.pv?.length || 0;
    const fallbackPvLen = fallback.pv?.length || 0;
    if (fallbackPvLen > rowPvLen) merged.pv = [...fallback.pv];
    if ((!merged.restSan || !String(merged.restSan).trim()) && fallback.restSan)
      merged.restSan = fallback.restSan;
    if (
      (!merged.firstSan || looksLikeRawUci(merged.firstSan)) &&
      fallback.firstSan &&
      !looksLikeRawUci(fallback.firstSan)
    ) {
      merged.firstSan = fallback.firstSan;
    }
    return merged;
  }

  function fallbackAnalysisRowsForCurrentContext() {
    const fen = state.current?.fen;
    const selectedSquare = state.selectedSquare || "";
    if (!fen) return [];
    const fallbackRows = [];
    if (state.analysisRows.length)
      fallbackRows.push(
        ...sanitizeAnalysisRows(state.analysisRows, fen, selectedSquare),
      );
    if (selectedSquare) {
      const pieceEntry =
        state.pieceAnalysisCache.get(selectedSquare) ||
        state.fenPieceAnalysisCache.get(fen)?.get(selectedSquare);
      if (pieceEntry?.rows?.length)
        fallbackRows.push(
          ...sanitizeAnalysisRows(pieceEntry.rows, fen, selectedSquare),
        );
    } else {
      const entry =
        state.positionAnalysisCache.get(fen) || matchingCachedFullAnalysisForFen(fen);
      if (entry?.rows?.length)
        fallbackRows.push(...sanitizeAnalysisRows(entry.rows, fen));
    }
    return normalizeAnalysisRows(fallbackRows);
  }

  function mergeAnalysisRowSets(primaryRows, fallbackRows, limit) {
    if (!primaryRows.length) return fallbackRows.slice(0, limit);
    if (!fallbackRows.length) return primaryRows.slice(0, limit);
    const merged = [];
    const seen = new Map();
    const upsert = (row) => {
      if (!row?.bestUci) return;
      const existingIndex = seen.get(row.bestUci);
      if (existingIndex === undefined) {
        seen.set(row.bestUci, merged.length);
        merged.push(row);
        return;
      }
      merged[existingIndex] = hydrateAnalysisRowFromFallback(
        merged[existingIndex],
        row,
      );
    };
    primaryRows.forEach(upsert);
    fallbackRows.forEach(upsert);
    return normalizeAnalysisRows(merged).slice(0, limit);
  }

  function dedupeAnalysisRows(rows) {
    const unique = [];
    const seen = new Map();
    for (const row of rows) {
      const key =
        row?.bestUci || `multipv:${row?.multipv || unique.length + 1}`;
      const existingIndex = seen.get(key);
      if (existingIndex === undefined) {
        seen.set(key, unique.length);
        unique.push(row);
        continue;
      }
      if (compareAnalysisRowQuality(row, unique[existingIndex]) > 0)
        unique[existingIndex] = row;
    }
    return unique;
  }

  function compareAnalysisRowQuality(a, b) {
    const evalGap = comparableEval(a) - comparableEval(b);
    if (evalGap) return evalGap;
    const depthGap = (a?.depth || 0) - (b?.depth || 0);
    if (depthGap) return depthGap;
    const nodeGap = (a?.nodes || 0) - (b?.nodes || 0);
    if (nodeGap) return nodeGap;
    return (
      (b?.multipv || Number.MAX_SAFE_INTEGER) -
      (a?.multipv || Number.MAX_SAFE_INTEGER)
    );
  }

  function currentBufferedAnalysisRows() {
    const legalUcis = legalUciSetForGame();
    const fen = state.current?.fen || "";
    const primaryRows = normalizeAnalysisRows(
      Array.from(state.analysisMap.values())
        .sort((a, b) => a.multipv - b.multipv)
        .filter((row) => row?.bestUci && legalUcis.has(row.bestUci)),
      fen,
    );
    const limit = activeAnalysisLimit();
    const fallbackRows = fallbackAnalysisRowsForCurrentContext().filter(
      (row) => row?.bestUci && legalUcis.has(row.bestUci),
    );
    return mergeAnalysisRowSets(primaryRows, fallbackRows, limit);
  }

  function snapshotFullPositionAnalysis() {
    if (state.selectedSquare || !state.analysisRows.length) return;
    const passMs = state.limitKind === "time" ? state.limitValue : 0;
    const entry = {
      fen: state.current.fen,
      map: new Map(state.analysisMap),
      rows: state.analysisRows.map((row) => ({ ...row })),
      publishedAt: state.analysisPublishedAt,
      publishedDepth: state.analysisPublishedDepth,
      passMs,
    };
    state.cachedFullAnalysis = entry;
    state.positionAnalysisCache.set(state.current.fen, entry);
    touchCachedFen(state.current.fen);
  }

  function restoreCachedFullPositionAnalysis(allowPartial = false) {
    const entry =
      state.positionAnalysisCache.get(state.current.fen) ||
      state.cachedFullAnalysis;
    if (
      !entry ||
      (!allowPartial && !cachedPositionIsReusable(entry, state.current.fen))
    )
      return false;
    const rows = sanitizeAnalysisRows(entry.rows, state.current.fen).map(
      (row) => enrichRowWithPVSan(row, state.current.fen),
    );
    if (!rows.length) return false;
    touchCachedFen(state.current.fen);
    state.cachedFullAnalysis = entry;
    state.analysisMap = new Map(rows.map((row) => [row.multipv, { ...row }]));
    rebuildAnalysisByUci();
    state.analysisRows = rows.map((row) => ({ ...row }));
    state.analysisPublishedAt = entry.publishedAt;
    state.analysisPublishedDepth = rows[0]?.depth || 0;
    state.awaitingFinalAnalysis = false;
    queueNextPlyAnalysis(rows, state.current.fen);
    return true;
  }

  function publishBufferedAnalysis(force) {
    const rows = currentBufferedAnalysisRows();
    if (!rows.length) return;
    rows.forEach((row) => enrichRowWithPVSan(row, state.current.fen));
    const topDepth = rows[0]?.depth || 0;
    const now = Date.now();
    if (!force) {
      if (state.engineMode !== "analysis") return;
      if (state.limitKind === "time") {
        if (!state.nextTimedPublishAt || now < state.nextTimedPublishAt) return;
      } else if (state.limitKind === "infinite") {
        if (
          now - state.analysisPublishedAt < ANALYSIS_PUBLISH_INTERVAL &&
          topDepth < state.analysisPublishedDepth + ANALYSIS_DEPTH_STEP
        )
          return;
      } else {
        return;
      }
    }
    state.analysisRows = rows;
    state.analysisPublishedAt = now;
    state.analysisPublishedDepth = topDepth;
    if (force) state.awaitingFinalAnalysis = false;
    snapshotFullPositionAnalysis();
    queueNextPlyAnalysis(rows);
    scheduleAnalysisRefresh();
  }

  function scheduleAnalysisRefresh() {
    if (analysisRaf) return;
    analysisRaf = requestAnimationFrame(() => {
      analysisRaf = null;
      renderAnalysisFull();
      renderBoard();
      renderBoardOverlay();
      renderMeta();
      renderEvalChart();
    });
  }

  function searchSummaryText() {
    const limitLabel = state.limitKind === "depth" ? "Depth" : "Timed";
    const limitValue =
      state.limitKind === "depth"
        ? `${state.limitValue}`
        : `${state.limitValue} ms`;
    return `${limitLabel} · ${limitValue} · ${state.linesShown} ${state.linesShown === 1 ? "line" : "lines"} · ${state.threads} ${state.threads === 1 ? "thread" : "threads"}`;
  }

  function searchSummaryCompactText() {
    const limitValue =
      state.limitKind === "depth"
        ? `d${state.limitValue}`
        : formatToolbarMs(state.limitValue);
    return `${limitValue} · ${state.linesShown}L · ${state.threads}T`;
  }

  function currentSearchLimitLabel() {
    return state.limitKind === "depth" ? "Depth" : "Time (ms)";
  }

  function currentSearchLimitSummaryLabel() {
    return state.limitKind === "depth" ? "Search Depth" : "Search Time";
  }

  function formatCurrentSearchLimitValue() {
    return state.limitKind === "depth"
      ? String(state.limitValue)
      : formatToolbarMs(state.limitValue);
  }

  function syncSearchSettingsControls() {
    if (ui.limitKind) ui.limitKind.value = state.limitKind;
    if (ui.limitValueLabel)
      ui.limitValueLabel.textContent = currentSearchLimitLabel();
    if (ui.limitValue) {
      ui.limitValue.min = "1";
      ui.limitValue.step = "1";
      ui.limitValue.max = state.limitKind === "depth" ? "245" : "1000000";
      ui.limitValue.value = String(state.limitValue);
    }
    if (ui.linesShown) ui.linesShown.value = String(state.linesShown);
    if (ui.threadsValue) ui.threadsValue.value = String(state.threads);
    renderThemeSettings();
  }

  function boardThemePreviewMarkup(themeKey) {
    const theme = BOARD_THEMES[themeKey];
    const cells = [];
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        cells.push(
          `<span class="theme-board-cell ${((row + col) % 2 === 0) ? "light" : "dark"}"></span>`,
        );
      }
    }
    return `
      <span class="theme-preview theme-preview-board" style="--theme-light:${theme.light};--theme-dark:${theme.dark}">
        ${cells.join("")}
      </span>
    `;
  }

  function pieceThemeAsset(themeKey, code) {
    const theme = PIECE_THEMES[themeKey] || PIECE_THEMES.maestro;
    return assetUrl(`pieces/${theme.assetSet}/${code}.svg`);
  }

  function pieceThemePreviewMarkup(themeKey) {
    return `
      <span class="theme-preview theme-preview-pieces">
        <img class="theme-piece" src="${pieceThemeAsset(themeKey, "wK")}" alt="">
        <img class="theme-piece" src="${pieceThemeAsset(themeKey, "bQ")}" alt="">
      </span>
    `;
  }

  function renderThemeCard(kind, key, label, previewMarkup, isActive) {
    return `
      <button
        class="theme-card${isActive ? " active" : ""}"
        type="button"
        role="option"
        aria-selected="${isActive ? "true" : "false"}"
        data-${kind}-theme="${key}"
      >
        ${previewMarkup}
        <span class="theme-card-label">${label}</span>
        ${isActive ? '<span class="theme-card-dot" aria-hidden="true"></span>' : ""}
      </button>
    `;
  }

  function renderThemeSettings() {
    if (ui.boardThemeOptions) {
      ui.boardThemeOptions.innerHTML = Object.entries(BOARD_THEMES)
        .map(([key, theme]) =>
          renderThemeCard(
            "board",
            key,
            theme.label,
            boardThemePreviewMarkup(key),
            state.boardTheme === key,
          ),
        )
        .join("");
    }

    if (ui.pieceThemeOptions) {
      ui.pieceThemeOptions.innerHTML = Object.entries(PIECE_THEMES)
        .map(([key, theme]) =>
          renderThemeCard(
            "piece",
            key,
            theme.label,
            pieceThemePreviewMarkup(key),
            state.pieceTheme === key,
          ),
        )
        .join("");
    }
  }

  function applyBoardThemeToBoardShell() {
    const theme = BOARD_THEMES[state.boardTheme] || BOARD_THEMES["dark-blue"];
    if (!ui.boardShell) return;
    ui.boardShell.style.setProperty("--light", theme.light);
    ui.boardShell.style.setProperty("--dark", theme.dark);
    ui.boardShell.style.setProperty("--coord", theme.coord);
    ui.boardShell.dataset.boardTheme = state.boardTheme;
  }

  function setBoardTheme(themeKey) {
    if (!BOARD_THEMES[themeKey] || state.boardTheme === themeKey) return;
    state.boardTheme = themeKey;
    applyBoardThemeToBoardShell();
    renderThemeSettings();
    saveSettings();
    renderBoard();
    renderBoardOverlay();
  }

  function setPieceTheme(themeKey) {
    if (!PIECE_THEMES[themeKey] || state.pieceTheme === themeKey) return;
    state.pieceTheme = themeKey;
    renderThemeSettings();
    saveSettings();
    renderBoard();
  }

  function onBoardThemeOptionClick(event) {
    const button = event.target.closest("[data-board-theme]");
    if (!button) return;
    setBoardTheme(button.dataset.boardTheme || "");
  }

  function onPieceThemeOptionClick(event) {
    const button = event.target.closest("[data-piece-theme]");
    if (!button) return;
    setPieceTheme(button.dataset.pieceTheme || "");
  }

  function renderSearchSummary() {
    if (!ui.searchSummary) return;
    const compact = searchSummaryCompactText();
    ui.searchSummary.innerHTML = `
      <span class="settings-chip settings-chip-primary"><span class="settings-chip-label">${currentSearchLimitSummaryLabel()}</span><span class="settings-chip-colon">:</span><span class="settings-chip-value">${formatCurrentSearchLimitValue()}</span></span>
      <span class="settings-chip"><span class="settings-chip-label">Multi PV</span><span class="settings-chip-colon">:</span><span class="settings-chip-value">${state.linesShown}</span></span>
      <span class="settings-chip"><span class="settings-chip-label">Threads</span><span class="settings-chip-colon">:</span><span class="settings-chip-value">${state.threads}</span></span>
    `;
    ui.searchSummary.setAttribute("aria-label", compact);
  }

  function formatToolbarMs(value) {
    if (value >= 1000) {
      const seconds = value / 1000;
      const rounded = Number.isInteger(seconds)
        ? seconds.toFixed(0)
        : seconds.toFixed(1).replace(/\.0$/, "");
      return `${rounded}s`;
    }
    return `${value}ms`;
  }

  function isValidCoachProvider(provider) {
    return provider === "claude" || provider === "gemini" || provider === "openai" || provider === "puter";
  }

  function providerDisplayName(provider) {
    if (provider === "claude") return "Claude";
    if (provider === "openai") return "ChatGPT / OpenAI";
    if (provider === "puter") return "Puter";
    return "Gemini";
  }

  function localApiKeyStorageKey(provider) {
    return `${STORAGE.apiKeyPrefix}${provider}`;
  }

  function localModelStorageKey(provider) {
    return `${STORAGE.modelPrefix}${provider}`;
  }

  function providerIsConfigured(provider) {
    if (!INITIAL_COACH_SETTINGS) return false;
    if (provider === "claude") {
      return !!INITIAL_COACH_SETTINGS.claudeConfigured;
    }
    if (provider === "openai") {
      return !!INITIAL_COACH_SETTINGS.openaiConfigured;
    }
    if (provider === "puter") {
      return !!INITIAL_COACH_SETTINGS.puterConfigured;
    }
    return !!INITIAL_COACH_SETTINGS.geminiConfigured;
  }

  function defaultCoachProvider() {
    const preferredProviderRaw = INITIAL_COACH_SETTINGS?.preferredProvider;
    const preferredProvider =
      preferredProviderRaw === "minimax" ? "openai" : preferredProviderRaw;
    if (isValidCoachProvider(preferredProvider)) {
      return preferredProvider;
    }
    return "claude";
  }

  function defaultCoachModelForProvider(provider) {
    if (provider === "claude") return "claude-opus-4-6";
    if (provider === "openai") return "gpt-5.4";
    if (provider === "puter") return "google/gemma-4-31b-it:free";
    return "gemini-3.1-pro-preview";
  }

  function savedCoachModelForProvider(provider) {
    if (!INITIAL_COACH_SETTINGS) return "";
    if (provider === "claude") return INITIAL_COACH_SETTINGS.claudeModel || "";
    if (provider === "openai") return INITIAL_COACH_SETTINGS.openaiModel || "";
    if (provider === "puter") return INITIAL_COACH_SETTINGS.puterModel || "";
    return INITIAL_COACH_SETTINGS.geminiModel || "";
  }

  function saveAssistantSettings() {
    if (!isValidCoachProvider(state.llmProvider)) {
      state.llmProvider = defaultCoachProvider();
    }
    state.llmApiKey = ui.apiKeyInput.value.trim();
    state.llmModel =
      ui.modelInput.value.trim() || savedCoachModelForProvider(state.llmProvider) || defaultCoachModelForProvider(state.llmProvider);
    localStorage.setItem(STORAGE.provider, state.llmProvider);
    localStorage.setItem(
      localApiKeyStorageKey(state.llmProvider),
      state.llmApiKey,
    );
    localStorage.setItem(
      localModelStorageKey(state.llmProvider),
      state.llmModel,
    );
    pushMessage(
      "system",
      `${providerDisplayName(state.llmProvider)} assistant settings saved locally.`,
    );
  }

  function resetAssistantSession() {
    state.llmMessages = [];
    state.llmConversation = [];
    state.llmWaiting = false;
    state.llmToolStatus = "";
    state.llmLastContextFen = "";
    state.llmLastContextTrail = "";
    state.llmTurnCount = 0;
    state.llmContextSentTurn = 0;
    state.llmExplainedFens.clear();
    schedulePersistedBoardStateSave();
  }

  function clearChat() {
    resetAssistantSession();
    renderAssistant();
  }

  function sendQuestion() {
    const question = ui.assistantInput.value.trim();
    if (!question) return;
    ui.assistantInput.value = "";
    sendToCoach(question);
  }

  function coachToolLabel(name) {
    switch (name) {
      case "stockfish_analyze":
        return "Using Stockfish";
      case "get_position_features":
        return "Reading position";
      case "get_legal_moves":
        return "Checking legal moves";
      case "describe_move_effects":
        return "Inspecting move effects";
      case "apply_move":
        return "Applying move";
      case "compare_moves":
        return "Comparing candidate moves";
      case "get_wikibooks_context":
        return "Loading opening notes";
      case "get_opening_name":
        return "Checking opening book";
      case "get_game_history":
        return "Reviewing game history";
      default:
        return "Thinking...";
    }
  }

  function buildCoachTools() {
    return [
      {
        name: "stockfish_analyze",
        description:
          "Run Stockfish on a position and return top engine lines with evaluations. Use this when you need exact engine numbers, best moves, blunder explanations, or continuations that are not already visible in the current board context. Prefer requesting up to 10 lines when comparing alternatives or explaining why a move is bad.",
        input_schema: {
          type: "object",
          properties: {
            fen: {
              type: "string",
              description:
                "FEN to analyze. Defaults to the current position if omitted.",
            },
            movetime_ms: {
              type: "integer",
              description: "Time budget in milliseconds.",
              minimum: 50,
              maximum: 20000,
            },
            lines: {
              type: "integer",
              description: "How many top lines to return.",
              minimum: 1,
              maximum: 10,
            },
          },
        },
      },
      {
        name: "get_position_features",
        description:
          "Return a grounded position snapshot for a FEN, including side to move, legal move count, check/checkmate/draw status, castling rights, material totals, and curated tactical or strategic observations such as forks, skewers, x-ray attacks, pins, hanging pieces, center control, development, and pawn-structure notes. Prefer stockfish_analyze when you need exact engine evaluation.",
        input_schema: {
          type: "object",
          properties: {
            fen: {
              type: "string",
              description:
                "FEN to inspect. Defaults to the current position if omitted.",
            },
          },
        },
      },
      {
        name: "get_legal_moves",
        description:
          "Return the legal moves for a FEN, optionally filtered to one starting square. Use this to verify whether a concrete move or follow-up line is actually legal before mentioning it. If you are about to name a move sequence that does not come directly from Stockfish output, call this first.",
        input_schema: {
          type: "object",
          properties: {
            fen: {
              type: "string",
              description:
                "FEN to inspect. Defaults to the current position if omitted.",
            },
            from_square: {
              type: "string",
              description:
                "Optional square like e2 or g8 to restrict results to moves from one piece.",
            },
            max_moves: {
              type: "integer",
              description:
                "Maximum number of legal moves to return after filtering.",
              minimum: 1,
              maximum: 256,
            },
          },
        },
      },
      {
        name: "get_game_history",
        description:
          "Return the full current game line with move numbers, SAN, eval snapshots, move classifications, and major swings. Use this when the user asks where they went wrong, where the game turned, or for a move-by-move review of the whole game.",
        input_schema: {
          type: "object",
          properties: {
            max_moves: {
              type: "integer",
              description: "Maximum number of plies to include, default 200.",
              minimum: 1,
              maximum: 400,
            },
          },
        },
      },
      {
        name: "apply_move",
        description:
          "Apply a single move (UCI or SAN) to a FEN and return the resulting position FEN. Use this to navigate to a position after a candidate move so you can then call get_position_features or stockfish_analyze on it. Essential for explaining why a move is good or bad by inspecting the resulting position rather than just the current one.",
        input_schema: {
          type: "object",
          properties: {
            fen: {
              type: "string",
              description:
                "FEN to update. Defaults to the current position if omitted.",
            },
            move: {
              type: "string",
              description: "Move in UCI like e2e4 or SAN like e4.",
            },
          },
          required: ["move"],
        },
      },
      {
        name: "describe_move_effects",
        description:
          "Apply a single move (UCI or SAN) to a FEN and return what that move concretely changes on the board: checks, captures, castling-right changes, piece activity, mobility shifts, and new tactical motifs like forks, pins, skewers, x-ray attacks, discovered attacks, or hanging pieces. Use this when you need to explain what each response move actually does, such as why a defensive reply loses material, walks into mate, loses king safety, or reduces a piece's activity.",
        input_schema: {
          type: "object",
          properties: {
            fen: {
              type: "string",
              description:
                "FEN to inspect. Defaults to the current position if omitted.",
            },
            move: {
              type: "string",
              description: "Move in UCI like e2e4 or SAN like e4.",
            },
          },
          required: ["move"],
        },
      },
      {
        name: "compare_moves",
        description:
          "Analyze two or more candidate moves from a position by running Stockfish on each resulting position and returning a structured comparison. Use this when the user asks why one move is better than another, or to explain the difference between two lines. This is more informative than calling stockfish_analyze on the current position because it examines what each move leads to.",
        input_schema: {
          type: "object",
          properties: {
            fen: {
              type: "string",
              description:
                "Baseline FEN to compare from. Defaults to the current position if omitted.",
            },
            moves: {
              type: "array",
              description: "Two to four candidate moves in UCI or SAN.",
              items: { type: "string" },
              minItems: 2,
              maxItems: 4,
            },
            movetime_ms: {
              type: "integer",
              description: "Engine time per candidate in milliseconds.",
              minimum: 200,
              maximum: 8000,
            },
          },
          required: ["moves"],
        },
      },
      {
        name: "get_opening_name",
        description:
          "Look up the opening name and ECO code from the local opening book for the current line or a position on the current line. Use this when the user asks what opening or variation is on the board. Do not pair this with get_wikibooks_context unless you need extra prose notes too.",
        input_schema: {
          type: "object",
          properties: {
            fen: {
              type: "string",
              description:
                "FEN to look up. Defaults to the current position if omitted.",
            },
          },
        },
      },
      {
        name: "get_wikibooks_context",
        description:
          "Fetch Wikibooks opening notes for a position on the current move path. Use this only when the user explicitly wants extra prose context, strategic ideas, or opening notes after the opening name itself is already known. Do not use it just to identify the opening name, and avoid calling it during normal move analysis because it hits a third-party site.",
        input_schema: {
          type: "object",
          properties: {
            fen: {
              type: "string",
              description:
                "FEN to look up on the current move path. Defaults to the current position if omitted.",
            },
          },
        },
      },
    ];
  }

  function trimConversationMessages(messages, maxSize = 20) {
    if (!Array.isArray(messages) || messages.length <= maxSize)
      return Array.isArray(messages) ? messages.slice() : [];
    return messages.slice(-maxSize);
  }

  function buildAssistantTurnMessage(userText, sendContext) {
    const currentFen = state.current?.fen || START_FEN;
    const currentTrail =
      currentPath()
        .slice(1)
        .map((node) => node.san)
        .join(" ") || "start position";
    const boardChanged =
      !!state.llmLastContextFen && state.llmLastContextFen !== currentFen;
    const boardStatus = boardChanged
      ? `Board changed since the previous coach turn.\nPrevious FEN: ${state.llmLastContextFen}\nPrevious move trail: ${state.llmLastContextTrail || "start position"}\nCurrent FEN: ${currentFen}\nCurrent move trail: ${currentTrail}`
      : state.llmLastContextFen
        ? "Board unchanged. Use previously provided board context."
        : "First coach turn in session.";
    const includeContext =
      sendContext ??
      (!state.llmLastContextFen ||
        boardChanged ||
        !state.llmContextSentTurn ||
        state.llmTurnCount - state.llmContextSentTurn >= 4);
    return {
      role: "user",
      content: [
        {
          type: "text",
          text: includeContext
            ? `${boardStatus}\n\nCurrent board context for this turn:\n\n${buildAssistantContext()}`
            : boardStatus,
        },
        { type: "text", text: userText },
      ],
    };
  }

  function extractCoachText(content) {
    function extractBlockText(block) {
      if (!block || block.type !== "text") return "";
      if (typeof block.text === "string") return block.text.trim();
      if (block.text && typeof block.text === "object") {
        if (typeof block.text.text === "string") return block.text.text.trim();
        if (typeof block.text.value === "string")
          return block.text.value.trim();
      }
      if (Array.isArray(block.text)) {
        return block.text
          .map((part) => {
            if (typeof part === "string") return part.trim();
            if (part && typeof part.text === "string") return part.text.trim();
            if (part && typeof part.value === "string")
              return part.value.trim();
            return "";
          })
          .filter(Boolean)
          .join(" ")
          .trim();
      }
      return "";
    }

    return (Array.isArray(content) ? content : [])
      .map((block) => extractBlockText(block))
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }

  function normalizeToolFen(fen) {
    return normalizeFen(String(fen || state.current?.fen || START_FEN));
  }

  function fileLetter(index) {
    return String.fromCharCode(97 + index);
  }

  function squareFromFileRank(file, rank) {
    if (file < 0 || file > 7 || rank < 0 || rank > 7) return "";
    return `${fileLetter(file)}${rank + 1}`;
  }

  function buildBoardMap(game) {
    const map = new Map();
    for (let file = 0; file < 8; file += 1) {
      for (let rank = 0; rank < 8; rank += 1) {
        const square = squareFromFileRank(file, rank);
        const piece = game.get(square);
        if (piece) map.set(square, piece);
      }
    }
    return map;
  }

  function pieceName(type) {
    return (
      {
        p: "pawn",
        n: "knight",
        b: "bishop",
        r: "rook",
        q: "queen",
        k: "king",
      }[type] || type
    );
  }

  function colorName(color) {
    return color === "w" ? "white" : "black";
  }

  function pieceCode(piece) {
    if (!piece) return "";
    const symbol = piece.type === "n" ? "N" : piece.type.toUpperCase();
    return piece.color === "w" ? symbol : symbol.toLowerCase();
  }

  function attackSquaresForPiece(boardMap, square, piece) {
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1], 10) - 1;
    const attacked = [];
    const push = (nextFile, nextRank) => {
      const nextSquare = squareFromFileRank(nextFile, nextRank);
      if (nextSquare) attacked.push(nextSquare);
    };
    if (piece.type === "p") {
      const delta = piece.color === "w" ? 1 : -1;
      push(file - 1, rank + delta);
      push(file + 1, rank + delta);
      return attacked;
    }
    if (piece.type === "n") {
      [
        [1, 2],
        [2, 1],
        [2, -1],
        [1, -2],
        [-1, -2],
        [-2, -1],
        [-2, 1],
        [-1, 2],
      ].forEach(([df, dr]) => push(file + df, rank + dr));
      return attacked;
    }
    if (piece.type === "k") {
      for (let df = -1; df <= 1; df += 1) {
        for (let dr = -1; dr <= 1; dr += 1) {
          if (!df && !dr) continue;
          push(file + df, rank + dr);
        }
      }
      return attacked;
    }
    const directions = [];
    if (piece.type === "b" || piece.type === "q")
      directions.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
    if (piece.type === "r" || piece.type === "q")
      directions.push([1, 0], [-1, 0], [0, 1], [0, -1]);
    directions.forEach(([df, dr]) => {
      let nextFile = file + df;
      let nextRank = rank + dr;
      while (nextFile >= 0 && nextFile < 8 && nextRank >= 0 && nextRank < 8) {
        const nextSquare = squareFromFileRank(nextFile, nextRank);
        if (!nextSquare) break;
        attacked.push(nextSquare);
        if (boardMap.has(nextSquare)) break;
        nextFile += df;
        nextRank += dr;
      }
    });
    return attacked;
  }

  function squareAttackers(boardMap, square, color) {
    const attackers = [];
    for (const [from, piece] of boardMap.entries()) {
      if (piece.color !== color) continue;
      const attacked = attackSquaresForPiece(boardMap, from, piece);
      if (attacked.includes(square))
        attackers.push({
          square: from,
          piece: pieceCode(piece),
          type: piece.type,
        });
    }
    return attackers;
  }

  function findKingSquare(boardMap, color) {
    for (const [square, piece] of boardMap.entries()) {
      if (piece.color === color && piece.type === "k") return square;
    }
    return "";
  }

  function collectMaterial(boardMap) {
    const emptyBucket = () => ({
      pawns: 0,
      knights: 0,
      bishops: 0,
      rooks: 0,
      queens: 0,
      total: 0,
    });
    const material = { white: emptyBucket(), black: emptyBucket() };
    for (const piece of boardMap.values()) {
      const bucket = piece.color === "w" ? material.white : material.black;
      if (piece.type === "p") bucket.pawns += 1;
      else if (piece.type === "n") bucket.knights += 1;
      else if (piece.type === "b") bucket.bishops += 1;
      else if (piece.type === "r") bucket.rooks += 1;
      else if (piece.type === "q") bucket.queens += 1;
      bucket.total += PIECE_VALUES[piece.type] || 0;
    }
    return {
      ...material,
      balance: material.white.total - material.black.total,
    };
  }

  function pawnFilesForColor(boardMap, color) {
    const files = new Map();
    for (const [square, piece] of boardMap.entries()) {
      if (piece.color !== color || piece.type !== "p") continue;
      const file = square.charCodeAt(0) - 97;
      const rank = parseInt(square[1], 10) - 1;
      if (!files.has(file)) files.set(file, []);
      files.get(file).push({ square, rank });
    }
    return files;
  }

  function isPassedPawn(boardMap, square, color) {
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1], 10) - 1;
    for (const [otherSquare, piece] of boardMap.entries()) {
      if (piece.type !== "p" || piece.color === color) continue;
      const otherFile = otherSquare.charCodeAt(0) - 97;
      const otherRank = parseInt(otherSquare[1], 10) - 1;
      if (Math.abs(otherFile - file) > 1) continue;
      if (color === "w" ? otherRank > rank : otherRank < rank) return false;
    }
    return true;
  }

  function pawnStructureForColor(boardMap, color) {
    const fileMap = pawnFilesForColor(boardMap, color);
    const doubledFiles = [];
    const isolated = [];
    const passed = [];
    for (const [file, pawns] of fileMap.entries()) {
      if (pawns.length > 1) doubledFiles.push(fileLetter(file));
      const hasNeighbor = fileMap.has(file - 1) || fileMap.has(file + 1);
      pawns.forEach(({ square }) => {
        if (!hasNeighbor) isolated.push(square);
        if (isPassedPawn(boardMap, square, color)) passed.push(square);
      });
    }
    const occupiedFiles = Array.from(fileMap.keys()).sort((a, b) => a - b);
    let islands = 0;
    occupiedFiles.forEach((file, index) => {
      if (index === 0 || file !== occupiedFiles[index - 1] + 1) islands += 1;
    });
    return {
      passed,
      isolated,
      doubled_files: doubledFiles,
      islands,
    };
  }

  function openFileProfile(boardMap) {
    const open = [];
    const semiOpen = { white: [], black: [] };
    for (let file = 0; file < 8; file += 1) {
      let whitePawns = 0;
      let blackPawns = 0;
      for (let rank = 0; rank < 8; rank += 1) {
        const piece = boardMap.get(squareFromFileRank(file, rank));
        if (!piece || piece.type !== "p") continue;
        if (piece.color === "w") whitePawns += 1;
        else blackPawns += 1;
      }
      const letter = fileLetter(file);
      if (!whitePawns && !blackPawns) open.push(letter);
      else {
        if (!whitePawns) semiOpen.white.push(letter);
        if (!blackPawns) semiOpen.black.push(letter);
      }
    }
    return { open, semi_open: semiOpen };
  }

  function analyzeColorMobility(fen, color, boardMap) {
    try {
      const parts = normalizeToolFen(fen).split(" ");
      parts[1] = color;
      parts[3] = "-";
      const game = new Chess(parts.join(" "));
      const verboseMoves = game.moves({ verbose: true });
      const counts = new Map();
      verboseMoves.forEach((move) =>
        counts.set(move.from, (counts.get(move.from) || 0) + 1),
      );
      return {
        total_moves: verboseMoves.length,
        by_piece: Array.from(counts.entries())
          .map(([square, count]) => {
            const piece = boardMap.get(square);
            return {
              square,
              piece: piece ? pieceCode(piece) : "",
              legal_moves: count,
            };
          })
          .sort(
            (a, b) =>
              b.legal_moves - a.legal_moves || a.square.localeCompare(b.square),
          ),
      };
    } catch (_) {
      return { total_moves: 0, by_piece: [] };
    }
  }

  function detectForks(boardMap, color, legalMoves, baseFen) {
    try {
      if (!Array.isArray(legalMoves) || !baseFen) return [];
      const enemy = color === "w" ? "b" : "w";
      const probe = new Chess(baseFen);
      const results = [];
      legalMoves
        .filter((move) => (boardMap.get(move.from)?.color || "") === color)
        .forEach((move) => {
          probe.load(baseFen);
          const played = probe.move({
            from: move.from,
            to: move.to,
            promotion: move.promotion || undefined,
          });
          if (!played) return;
          const afterBoard = buildBoardMap(probe);
          const forkingPiece = afterBoard.get(move.to);
          if (!forkingPiece || forkingPiece.color !== color) return;
          if (forkingPiece.type === "k") return;
          const targets = attackSquaresForPiece(
            afterBoard,
            move.to,
            forkingPiece,
          )
            .map((targetSquare) => {
              const targetPiece = afterBoard.get(targetSquare);
              if (!targetPiece || targetPiece.color !== enemy) return null;
              const targetValue = PIECE_VALUES[targetPiece.type] || 0;
              return {
                square: targetSquare,
                piece: pieceCode(targetPiece),
                type: targetPiece.type,
                value: targetValue,
                is_king: targetPiece.type === "k",
              };
            })
            .filter(Boolean);
          const valuableTargets = targets.filter(
            (target) => target.is_king || target.value >= 3,
          );
          if (
            !(
              valuableTargets.length >= 2 ||
              (valuableTargets.length >= 1 && targets.length >= 2)
            )
          ) {
            return;
          }
          if (
            movedPieceIsImmediatelyPunishable(
              probe.fen(),
              afterBoard,
              forkingPiece,
              move.to,
            )
          )
            return;
          const nullMoveForkProbe = probeForkNullMoveCapture(
            probe.fen(),
            afterBoard,
            forkingPiece,
            move.to,
            targets,
          );
          if (!nullMoveForkProbe.hasFollowUpCapture) return;
          const captureSquareSet = new Set(nullMoveForkProbe.captureSquares || []);
          const meaningfulTargets = targets.filter(
            (target) => target.is_king || captureSquareSet.has(target.square),
          );
          if (meaningfulTargets.length < 2) return;
          const meaningfulValuableTargets = meaningfulTargets.filter(
            (target) => target.is_king || target.value >= 3,
          );
          const totalValue = meaningfulTargets.reduce(
            (sum, target) => sum + (target.is_king ? 100 : target.value),
            0,
          );
          results.push({
            move_san: move.san,
            move_uci: move.from + move.to + (move.promotion || ""),
            from: move.from,
            to: move.to,
            forking_piece: pieceCode(forkingPiece),
            targets: meaningfulTargets
              .sort(
                (a, b) =>
                  Number(b.is_king) - Number(a.is_king) || b.value - a.value,
              )
              .slice(0, 4),
            target_count: meaningfulTargets.length,
            valuable_target_count: meaningfulValuableTargets.length,
            contains_king: meaningfulTargets.some((target) => target.is_king),
            total_target_value: totalValue,
          });
        });
      return results
        .sort(
          (a, b) =>
            Number(b.contains_king) - Number(a.contains_king) ||
            b.valuable_target_count - a.valuable_target_count ||
            b.total_target_value - a.total_target_value ||
            a.move_san.localeCompare(b.move_san),
        )
        .slice(0, 8);
    } catch (_) {
      return [];
    }
  }

  function probeForkNullMoveCapture(afterFen, afterBoard, movedPiece, fromSquare, targets) {
    try {
      if (!afterFen || !afterBoard || !movedPiece || !fromSquare) {
        return { hasFollowUpCapture: false, captureSquares: [] };
      }
      const targetList = Array.isArray(targets) ? targets.filter(Boolean) : [];
      if (!targetList.length) {
        return { hasFollowUpCapture: false, captureSquares: [] };
      }
      const fenParts = normalizeToolFen(afterFen).split(" ");
      fenParts[1] = movedPiece.color;
      fenParts[3] = "-";
      const probeGame = new Chess(fenParts.join(" "));
      const targetMap = new Map(targetList.map((target) => [target.square, target]));
      const attackMap = buildAttackMap(afterBoard);
      const captureSquares = probeGame
        .moves({ verbose: true })
        .filter((move) => {
          if (move.from !== fromSquare || !targetMap.has(move.to)) return false;
          if (!move.captured && !String(move.flags || "").includes("e")) return false;
          const target = targetMap.get(move.to);
          if (!target || target.is_king) return false;
          const staticExchange = computeSEE(
            afterBoard,
            move.to,
            movedPiece.color,
            attackMap,
          );
          if (!(staticExchange > 0)) return false;
          const forwardProbe = new Chess(probeGame.fen());
          const playedForward = forwardProbe.move({
            from: move.from,
            to: move.to,
            promotion: move.promotion || undefined,
          });
          if (!playedForward) return false;
          const forwardBoard = buildBoardMap(forwardProbe);
          const movedAfterCapture = forwardBoard.get(move.to);
          if (!movedAfterCapture) return false;
          return !movedPieceIsImmediatelyPunishable(
            forwardProbe.fen(),
            forwardBoard,
            movedAfterCapture,
            move.to,
          );
        })
        .map((move) => move.to);
      return {
        hasFollowUpCapture: captureSquares.length > 0,
        captureSquares,
      };
    } catch (_) {
      return { hasFollowUpCapture: false, captureSquares: [] };
    }
  }

  function movedPieceIsImmediatelyPunishable(afterFen, afterBoard, movedPiece, square) {
    try {
      if (!afterFen || !square) return false;
      return bestLegalExchangeGainOnSquare(afterFen, square) > 0;
    } catch (_) {
      return false;
    }
  }

  function detectAbsolutePins(boardMap, color) {
    const kingSquare = findKingSquare(boardMap, color);
    if (!kingSquare) return [];
    const kingFile = kingSquare.charCodeAt(0) - 97;
    const kingRank = parseInt(kingSquare[1], 10) - 1;
    const results = [];
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ].forEach(([df, dr]) => {
      let file = kingFile + df;
      let rank = kingRank + dr;
      let candidate = null;
      while (file >= 0 && file < 8 && rank >= 0 && rank < 8) {
        const square = squareFromFileRank(file, rank);
        const piece = boardMap.get(square);
        if (!piece) {
          file += df;
          rank += dr;
          continue;
        }
        if (!candidate) {
          if (piece.color === color) {
            candidate = { square, piece: pieceCode(piece) };
            file += df;
            rank += dr;
            continue;
          }
          break;
        }
        const diagonal = Math.abs(df) === Math.abs(dr);
        const sliderOkay =
          piece.color !== color &&
          (piece.type === "q" ||
            (!diagonal && piece.type === "r") ||
            (diagonal && piece.type === "b"));
        if (sliderOkay) {
          results.push({
            square: candidate.square,
            piece: candidate.piece,
            pinned_by: pieceCode(piece),
            attacker_square: square,
          });
        }
        break;
      }
    });
    return results;
  }

  function detectSkewers(boardMap, color) {
    const enemy = color === "w" ? "b" : "w";
    const results = [];
    for (const [attackerSquare, attackerPiece] of boardMap.entries()) {
      if (attackerPiece.color !== enemy) continue;
      if (!["b", "r", "q"].includes(attackerPiece.type)) continue;
      const directions = [];
      if (attackerPiece.type === "b" || attackerPiece.type === "q")
        directions.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
      if (attackerPiece.type === "r" || attackerPiece.type === "q")
        directions.push([1, 0], [-1, 0], [0, 1], [0, -1]);
      const attackerFile = attackerSquare.charCodeAt(0) - 97;
      const attackerRank = parseInt(attackerSquare[1], 10) - 1;
      directions.forEach(([df, dr]) => {
        let file = attackerFile + df;
        let rank = attackerRank + dr;
        let front = null;
        while (file >= 0 && file < 8 && rank >= 0 && rank < 8) {
          const square = squareFromFileRank(file, rank);
          const piece = boardMap.get(square);
          if (!piece) {
            file += df;
            rank += dr;
            continue;
          }
          if (piece.color !== color) break;
          if (!front) {
            front = {
              square,
              piece: pieceCode(piece),
              type: piece.type,
              value: PIECE_VALUES[piece.type] || 0,
            };
            file += df;
            rank += dr;
            continue;
          }
          const behind = {
            square,
            piece: pieceCode(piece),
            type: piece.type,
            value: PIECE_VALUES[piece.type] || 0,
          };
          if (front.value > behind.value) {
            results.push({
              attacker_square: attackerSquare,
              attacker: pieceCode(attackerPiece),
              front_square: front.square,
              front_piece: front.piece,
              behind_square: behind.square,
              behind_piece: behind.piece,
            });
          }
          break;
        }
      });
    }
    return results;
  }

  function detectPromotionThreats(boardMap, color) {
    const enemyKingSquare = findKingSquare(boardMap, color === "w" ? "b" : "w");
    const promotionRank = color === "w" ? 7 : 0;
    const threats = [];
    for (const [square, piece] of boardMap.entries()) {
      if (piece.color !== color || piece.type !== "p") continue;
      if (!isPassedPawn(boardMap, square, color)) continue;
      const file = square.charCodeAt(0) - 97;
      const rank = parseInt(square[1], 10) - 1;
      const promoSquare = squareFromFileRank(file, promotionRank);
      const promotionBoard = new Map(boardMap);
      promotionBoard.delete(square);
      promotionBoard.set(promoSquare, { type: "q", color });
      const fakeQueen = { type: "q", color };
      threats.push({
        square,
        moves_to_promote: color === "w" ? 7 - rank : rank,
        promo_square: promoSquare,
        check_on_promotion:
          !!enemyKingSquare &&
          attackSquaresForPiece(
            promotionBoard,
            promoSquare,
            fakeQueen,
          ).includes(enemyKingSquare),
      });
    }
    return threats.sort(
      (a, b) =>
        a.moves_to_promote - b.moves_to_promote ||
        a.square.localeCompare(b.square),
    );
  }

  function detectKingOpposition(boardMap, turn = "w") {
    const whiteKing = findKingSquare(boardMap, "w");
    const blackKing = findKingSquare(boardMap, "b");
    if (!whiteKing || !blackKing) {
      return {
        type: "none",
        white_king: whiteKing,
        black_king: blackKing,
        side_with_opposition: "none",
      };
    }
    const whiteFile = whiteKing.charCodeAt(0) - 97;
    const whiteRank = parseInt(whiteKing[1], 10) - 1;
    const blackFile = blackKing.charCodeAt(0) - 97;
    const blackRank = parseInt(blackKing[1], 10) - 1;
    const fileDist = Math.abs(whiteFile - blackFile);
    const rankDist = Math.abs(whiteRank - blackRank);
    let type = "none";
    if (
      (fileDist === 0 && rankDist === 2) ||
      (fileDist === 2 && rankDist === 0)
    )
      type = "direct";
    else if (fileDist === 2 && rankDist === 2) type = "diagonal";
    return {
      type,
      white_king: whiteKing,
      black_king: blackKing,
      side_with_opposition:
        type === "none" ? "none" : turn === "w" ? "black" : "white",
    };
  }

  function computeKingSafety(boardMap, color, fileProfile) {
    const kingSquare = findKingSquare(boardMap, color);
    if (!kingSquare) return null;
    const file = kingSquare.charCodeAt(0) - 97;
    const rank = parseInt(kingSquare[1], 10) - 1;
    const forward = color === "w" ? 1 : -1;
    let pawnShield = 0;
    for (let df = -1; df <= 1; df += 1) {
      for (const dr of [forward, forward * 2]) {
        const piece = boardMap.get(squareFromFileRank(file + df, rank + dr));
        if (piece?.color === color && piece.type === "p") {
          pawnShield += 1;
          break;
        }
      }
    }
    const zone = [];
    for (let df = -1; df <= 1; df += 1) {
      for (let dr = -1; dr <= 1; dr += 1) {
        if (!df && !dr) continue;
        const square = squareFromFileRank(file + df, rank + dr);
        if (square) zone.push(square);
      }
    }
    const enemy = color === "w" ? "b" : "w";
    const attackedSquares = zone.filter(
      (square) => squareAttackers(boardMap, square, enemy).length > 0,
    );
    const nearbyOpenFiles = fileProfile.open.filter(
      (letter) => Math.abs(letter.charCodeAt(0) - 97 - file) <= 1,
    );
    return {
      square: kingSquare,
      pawn_shield: pawnShield,
      adjacent_enemy_attacks: attackedSquares.length,
      open_files_near_king: nearbyOpenFiles,
      score: pawnShield * 2 - attackedSquares.length - nearbyOpenFiles.length,
    };
  }

  function captureTargetFromMove(game, move) {
    if (move.captured)
      return { type: move.captured, value: PIECE_VALUES[move.captured] || 0 };
    if (String(move.flags || "").includes("e"))
      return { type: "p", value: PIECE_VALUES.p };
    const target = game.get(move.to);
    return target
      ? { type: target.type, value: PIECE_VALUES[target.type] || 0 }
      : null;
  }

  function summarizeCaptureThreats(game) {
    const moves = game.moves({ verbose: true });
    return moves
      .filter(
        (move) =>
          String(move.flags || "").includes("c") ||
          String(move.flags || "").includes("e"),
      )
      .map((move) => {
        const attacker = game.get(move.from);
        const target = captureTargetFromMove(game, move);
        return {
          san: move.san,
          from: move.from,
          to: move.to,
          attacker: attacker ? pieceCode(attacker) : "",
          target: target ? pieceName(target.type) : "piece",
          swing: target
            ? target.value - (PIECE_VALUES[attacker?.type] || 0)
            : 0,
        };
      })
      .sort((a, b) => b.swing - a.swing || a.san.localeCompare(b.san))
      .slice(0, 8);
  }

  function summarizeForks(game) {
    const boardMap = buildBoardMap(game);
    const baseFen = game.fen();
    const probe = new Chess(baseFen);
    return game
      .moves({ verbose: true })
      .sort(
        (a, b) => (PIECE_VALUES[b.piece] || 0) - (PIECE_VALUES[a.piece] || 0),
      )
      .slice(0, 40)
      .map((move) => {
        probe.load(baseFen);
        const played = probe.move({
          from: move.from,
          to: move.to,
          promotion: move.promotion || undefined,
        });
        if (!played) return null;
        const nextBoard = buildBoardMap(probe);
        const movedPiece = nextBoard.get(move.to);
        if (!movedPiece) return null;
        const targets = attackSquaresForPiece(nextBoard, move.to, movedPiece)
          .map((square) => {
            const piece = nextBoard.get(square);
            return piece && piece.color !== movedPiece.color
              ? {
                  square,
                  piece: pieceCode(piece),
                  value: PIECE_VALUES[piece.type] || 0,
                }
              : null;
          })
          .filter(Boolean)
          .filter(
            (target) => target.value >= 3 || target.piece.toLowerCase() === "k",
          );
        if (targets.length < 2) return null;
        return {
          san: move.san,
          from: move.from,
          to: move.to,
          attacks: targets.slice(0, 4),
          score: targets.reduce((sum, target) => sum + target.value, 0),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.san.localeCompare(b.san))
      .slice(0, 6);
  }

  function summarizeCheckThreats(game) {
    const baseFen = game.fen();
    const probe = new Chess(baseFen);
    const threatProbe = new Chess(baseFen);
    const mover = game.turn();
    return game
      .moves({ verbose: true })
      .sort(
        (a, b) => (PIECE_VALUES[b.piece] || 0) - (PIECE_VALUES[a.piece] || 0),
      )
      .slice(0, 40)
      .map((move) => {
        if (/[+#]/.test(move.san)) return null;
        probe.load(baseFen);
        const played = probe.move({
          from: move.from,
          to: move.to,
          promotion: move.promotion || undefined,
        });
        if (!played) return null;
        const parts = probe.fen().split(" ");
        parts[1] = mover;
        parts[3] = "-";
        threatProbe.load(parts.join(" "));
        const checkingMoves = threatProbe
          .moves({ verbose: true })
          .filter((candidate) => /[+#]/.test(candidate.san));
        if (!checkingMoves.length) return null;
        return {
          san: move.san,
          from: move.from,
          to: move.to,
          threat_count: checkingMoves.length,
          sample_check: checkingMoves[0].san,
        };
      })
      .filter(Boolean)
      .sort(
        (a, b) => b.threat_count - a.threat_count || a.san.localeCompare(b.san),
      )
      .slice(0, 5);
  }

  function pieceValueCp(type) {
    try {
      return (PIECE_VALUES[type] || 0) * 100;
    } catch (_) {
      return 0;
    }
  }

  function squareCoords(square) {
    try {
      if (!square || square.length < 2) return null;
      return {
        file: square.charCodeAt(0) - 97,
        rank: parseInt(square[1], 10) - 1,
      };
    } catch (_) {
      return null;
    }
  }

  function chebyshevDistance(squareA, squareB) {
    try {
      const a = squareCoords(squareA);
      const b = squareCoords(squareB);
      if (!a || !b) return 99;
      return Math.max(Math.abs(a.file - b.file), Math.abs(a.rank - b.rank));
    } catch (_) {
      return 99;
    }
  }

  function squareColorComplex(square) {
    try {
      const coords = squareCoords(square);
      if (!coords) return "light";
      return (coords.file + coords.rank) % 2 === 0 ? "dark" : "light";
    } catch (_) {
      return "light";
    }
  }

  function allBoardSquares() {
    try {
      const squares = [];
      for (let file = 0; file < 8; file += 1) {
        for (let rank = 0; rank < 8; rank += 1)
          squares.push(squareFromFileRank(file, rank));
      }
      return squares;
    } catch (_) {
      return [];
    }
  }

  function pieceList(boardMap, color, types = null) {
    try {
      const list = [];
      for (const [square, piece] of boardMap.entries()) {
        if (piece.color !== color) continue;
        if (Array.isArray(types) && !types.includes(piece.type)) continue;
        list.push({ square, piece });
      }
      return list;
    } catch (_) {
      return [];
    }
  }

  function getAttackEntry(attackMap, square) {
    try {
      return attackMap.get(square) || { white: [], black: [] };
    } catch (_) {
      return { white: [], black: [] };
    }
  }

  function addSummarySentence(summary, categoryCounts, category, text, tags) {
    try {
      if (!text) return;
      if (summary.length >= 14) return;
      const count = categoryCounts.get(category) || 0;
      if (count >= 2) return;
      summary.push({ text, tags: Array.isArray(tags) ? tags : [] });
      categoryCounts.set(category, count + 1);
    } catch (_) {}
  }

  function isPawnDefendedSquare(boardMap, color, square) {
    try {
      const coords = squareCoords(square);
      if (!coords) return false;
      const pawnRank = color === "w" ? coords.rank - 1 : coords.rank + 1;
      const left = squareFromFileRank(coords.file - 1, pawnRank);
      const right = squareFromFileRank(coords.file + 1, pawnRank);
      const leftPiece = left ? boardMap.get(left) : null;
      const rightPiece = right ? boardMap.get(right) : null;
      return (
        (leftPiece?.color === color && leftPiece.type === "p") ||
        (rightPiece?.color === color && rightPiece.type === "p")
      );
    } catch (_) {
      return false;
    }
  }

  function buildAttackMap(boardMap) {
    try {
      const attackMap = new Map();
      allBoardSquares().forEach((square) =>
        attackMap.set(square, { white: [], black: [] }),
      );
      for (const [from, piece] of boardMap.entries()) {
        const attacks = attackSquaresForPiece(boardMap, from, piece);
        const bucketKey = piece.color === "w" ? "white" : "black";
        attacks.forEach((target) => {
          const bucket = attackMap.get(target);
          if (!bucket) return;
          bucket[bucketKey].push({
            square: from,
            type: piece.type,
            value: pieceValueCp(piece.type),
          });
        });
      }
      return attackMap;
    } catch (_) {
      return new Map();
    }
  }

  function computeSEE(boardMap, square, initialColor, attackMap = null) {
    try {
      const targetPiece = boardMap.get(square);
      const attackSource = attackMap ? getAttackEntry(attackMap, square) : null;
      const whiteAttackers = (
        attackSource
          ? attackSource.white
          : squareAttackers(boardMap, square, "w").map((entry) => ({
              square: entry.square,
              type: entry.type,
              value: pieceValueCp(entry.type),
            }))
      )
        .slice()
        .sort((a, b) => a.value - b.value);
      const blackAttackers = (
        attackSource
          ? attackSource.black
          : squareAttackers(boardMap, square, "b").map((entry) => ({
              square: entry.square,
              type: entry.type,
              value: pieceValueCp(entry.type),
            }))
      )
        .slice()
        .sort((a, b) => a.value - b.value);
      const initialAttackers =
        initialColor === "w" ? whiteAttackers : blackAttackers;
      if (!initialAttackers.length) return 0;
      const gain = [];
      gain[0] = pieceValueCp(targetPiece?.type || "p");
      let whiteIndex = initialColor === "w" ? 1 : 0;
      let blackIndex = initialColor === "b" ? 1 : 0;
      let side = initialColor === "w" ? "b" : "w";
      let depth = 1;
      while (depth < 12) {
        const attackers = side === "w" ? whiteAttackers : blackAttackers;
        const index = side === "w" ? whiteIndex : blackIndex;
        if (index >= attackers.length) break;
        const attacker = attackers[index];
        gain[depth] = attacker.value - gain[depth - 1];
        if (side === "w") whiteIndex += 1;
        else blackIndex += 1;
        side = side === "w" ? "b" : "w";
        depth += 1;
      }
      for (let index = depth - 1; index > 0; index -= 1) {
        gain[index - 1] = Math.max(-gain[index], gain[index - 1]);
      }
      return Math.max(0, gain[0] || 0);
    } catch (_) {
      return 0;
    }
  }

  function legalCaptureNet(game, move, depth = 0, maxDepth = 12) {
    try {
      if (!game || !move || depth >= maxDepth) return 0;
      const flags = String(move.flags || "");
      const capturedType = move.captured || (flags.includes("e") ? "p" : "");
      const capturedValue = pieceValueCp(capturedType);
      if (capturedValue <= 0) return 0;
      const next = new Chess(game.fen());
      const played = next.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion || undefined,
      });
      if (!played) return 0;
      const replies = next.moves({ verbose: true }).filter((candidate) => {
        if (candidate.to !== move.to) return false;
        return Boolean(candidate.captured) || String(candidate.flags || "").includes("e");
      });
      let bestReply = 0;
      for (const reply of replies) {
        bestReply = Math.max(bestReply, legalCaptureNet(next, reply, depth + 1, maxDepth));
      }
      return Math.max(0, capturedValue - bestReply);
    } catch (_) {
      return 0;
    }
  }

  function bestLegalExchangeGainOnSquare(fen, square) {
    try {
      if (!fen || !square) return 0;
      const game = new Chess(normalizeToolFen(fen));
      const captures = game.moves({ verbose: true }).filter((move) => {
        if (move.to !== square) return false;
        return Boolean(move.captured) || String(move.flags || "").includes("e");
      });
      let best = 0;
      for (const move of captures) {
        best = Math.max(best, legalCaptureNet(game, move));
      }
      return best;
    } catch (_) {
      return 0;
    }
  }

  function detectGamePhase(boardMap) {
    try {
      let whiteQueens = 0;
      let blackQueens = 0;
      let minorPieces = 0;
      const material = { w: 0, b: 0 };
      let rooksOnly = true;
      for (const piece of boardMap.values()) {
        if (piece.type === "q") {
          if (piece.color === "w") whiteQueens += 1;
          else blackQueens += 1;
        }
        if (piece.type === "n" || piece.type === "b") minorPieces += 1;
        if (piece.type !== "p" && piece.type !== "k")
          material[piece.color] += PIECE_VALUES[piece.type] || 0;
        if (!["r", "p", "k"].includes(piece.type)) rooksOnly = false;
      }
      if (rooksOnly) return "rook_endgame";
      if (!whiteQueens && !blackQueens && (material.w > 13 || material.b > 13))
        return "queenless_endgame";
      if (
        (!whiteQueens && !blackQueens) ||
        (material.w <= 13 && material.b <= 13)
      )
        return "endgame";
      if (whiteQueens && blackQueens && minorPieces >= 5) return "opening";
      return "middlegame";
    } catch (_) {
      return "middlegame";
    }
  }

  function detectMaterialClass(boardMap) {
    try {
      const order = { k: 0, q: 1, r: 2, b: 3, n: 4, p: 5 };
      const whitePieces = [];
      const blackPieces = [];
      let pieceCount = 0;
      let hasPawns = false;
      let bothQueens = false;
      for (const piece of boardMap.values()) {
        pieceCount += 1;
        if (piece.type === "p") hasPawns = true;
        if (piece.color === "w") whitePieces.push(piece.type.toUpperCase());
        else blackPieces.push(piece.type);
      }
      bothQueens = whitePieces.includes("Q") && blackPieces.includes("q");
      whitePieces.sort(
        (a, b) => order[a.toLowerCase()] - order[b.toLowerCase()],
      );
      blackPieces.sort((a, b) => order[a] - order[b]);
      return {
        signature: `${whitePieces.join("")}${blackPieces.join("")}`,
        piece_count: pieceCount,
        has_pawns: hasPawns,
        both_queens: bothQueens,
        probe_recommended: pieceCount <= 7,
      };
    } catch (_) {
      return {
        signature: "",
        piece_count: 0,
        has_pawns: false,
        both_queens: false,
        probe_recommended: false,
      };
    }
  }

  function detectHangingPieces(boardMap, attackMap) {
    try {
      const result = { white: [], black: [] };
      for (const [square, piece] of boardMap.entries()) {
        if (piece.type === "k") continue;
        const entry = getAttackEntry(attackMap, square);
        const enemyAttackers = piece.color === "w" ? entry.black : entry.white;
        const defenders = piece.color === "w" ? entry.white : entry.black;
        if (!enemyAttackers.length || defenders.length) continue;
        result[piece.color === "w" ? "white" : "black"].push({
          square,
          piece: pieceCode(piece),
          value: PIECE_VALUES[piece.type] || 0,
        });
      }
      return result;
    } catch (_) {
      return { white: [], black: [] };
    }
  }

  function detectUnderdefendedPieces(boardMap, attackMap, hangingPieces) {
    try {
      const result = { white: [], black: [] };
      const hangingSet = new Set([
        ...(hangingPieces?.white || []).map((entry) => entry.square),
        ...(hangingPieces?.black || []).map((entry) => entry.square),
      ]);
      for (const [square, piece] of boardMap.entries()) {
        if (piece.type === "k" || hangingSet.has(square)) continue;
        const entry = getAttackEntry(attackMap, square);
        const enemyColor = piece.color === "w" ? "b" : "w";
        const enemyAttackers = piece.color === "w" ? entry.black : entry.white;
        if (!enemyAttackers.length) continue;
        if (computeSEE(boardMap, square, enemyColor, attackMap) <= 0) continue;
        result[piece.color === "w" ? "white" : "black"].push({
          square,
          piece: pieceCode(piece),
          value: PIECE_VALUES[piece.type] || 0,
        });
      }
      return result;
    } catch (_) {
      return { white: [], black: [] };
    }
  }

  function detectOverloadedPieces(boardMap, attackMap) {
    try {
      const result = { white: [], black: [] };
      ["w", "b"].forEach((color) => {
        const soleTargets = new Map();
        for (const [square, piece] of boardMap.entries()) {
          if (piece.color !== color) continue;
          const entry = getAttackEntry(attackMap, square);
          const enemyAttackers = color === "w" ? entry.black : entry.white;
          const defenders = color === "w" ? entry.white : entry.black;
          if (!enemyAttackers.length || defenders.length !== 1) continue;
          const sole = defenders[0];
          if (!soleTargets.has(sole.square)) soleTargets.set(sole.square, []);
          soleTargets.get(sole.square).push(square);
        }
        for (const [defenderSquare, targets] of soleTargets.entries()) {
          if (targets.length < 2) continue;
          const defenderPiece = boardMap.get(defenderSquare);
          if (!defenderPiece) continue;
          result[color === "w" ? "white" : "black"].push({
            square: defenderSquare,
            piece: pieceCode(defenderPiece),
            defends: targets,
            overload_count: targets.length,
          });
        }
      });
      return result;
    } catch (_) {
      return { white: [], black: [] };
    }
  }

  function detectRelativePins(boardMap, color) {
    try {
      const results = [];
      const enemy = color === "w" ? "b" : "w";
      for (const [attackerSquare, attackerPiece] of boardMap.entries()) {
        if (
          attackerPiece.color !== enemy ||
          !["b", "r", "q"].includes(attackerPiece.type)
        )
          continue;
        const directions = [];
        if (attackerPiece.type === "b" || attackerPiece.type === "q")
          directions.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
        if (attackerPiece.type === "r" || attackerPiece.type === "q")
          directions.push([1, 0], [-1, 0], [0, 1], [0, -1]);
        const origin = squareCoords(attackerSquare);
        directions.forEach(([df, dr]) => {
          let file = origin.file + df;
          let rank = origin.rank + dr;
          let candidate = null;
          while (file >= 0 && file < 8 && rank >= 0 && rank < 8) {
            const square = squareFromFileRank(file, rank);
            const piece = boardMap.get(square);
            if (!piece) {
              file += df;
              rank += dr;
              continue;
            }
            if (!candidate) {
              if (piece.color === color) {
                candidate = {
                  square,
                  piece,
                  value: PIECE_VALUES[piece.type] || 0,
                };
                file += df;
                rank += dr;
                continue;
              }
              break;
            }
            if (piece.color !== color) break;
            const behindValue = PIECE_VALUES[piece.type] || 0;
            if (behindValue > candidate.value) {
              results.push({
                square: candidate.square,
                piece: pieceCode(candidate.piece),
                pinned_by: pieceCode(attackerPiece),
                attacker_square: attackerSquare,
                shielded_square: square,
                shielded_piece: pieceCode(piece),
                value_shielded: behindValue,
              });
            }
            break;
          }
        });
      }
      return results;
    } catch (_) {
      return [];
    }
  }

  function detectDiscoveredAttacks(boardMap, color, legalMoves, baseFen) {
    try {
      if (!Array.isArray(legalMoves) || legalMoves.length > 50 || !baseFen)
        return { attacks: [], checks: [], double_checks: [] };
      const attacks = [];
      const checks = [];
      const doubleChecks = [];
      const probe = new Chess(baseFen);
      const sliders = pieceList(boardMap, color, ["b", "r", "q"]);
      legalMoves
        .filter((move) => (boardMap.get(move.from)?.color || "") === color)
        .forEach((move) => {
          probe.load(baseFen);
          const beforeBoard = buildBoardMap(probe);
          const beforeKing = findKingSquare(
            beforeBoard,
            color === "w" ? "b" : "w",
          );
          const played = probe.move({
            from: move.from,
            to: move.to,
            promotion: move.promotion || undefined,
          });
          if (!played) return;
          const afterBoard = buildBoardMap(probe);
          const afterKing = findKingSquare(
            afterBoard,
            color === "w" ? "b" : "w",
          );
          const checkingPieces = [];
          sliders.forEach((slider) => {
            if (slider.square === move.from) return;
            const beforePiece = beforeBoard.get(slider.square);
            const afterPiece = afterBoard.get(slider.square);
            if (!beforePiece || !afterPiece) return;
            const beforeTargets = attackSquaresForPiece(
              beforeBoard,
              slider.square,
              beforePiece,
            );
            const afterTargets = attackSquaresForPiece(
              afterBoard,
              slider.square,
              afterPiece,
            );
            if (
              afterKing &&
              afterTargets.includes(afterKing) &&
              !beforeTargets.includes(beforeKing)
            ) {
              checkingPieces.push(slider.square);
            }
            afterTargets.forEach((targetSquare) => {
              if (beforeTargets.includes(targetSquare)) return;
              const targetPiece = afterBoard.get(targetSquare);
              if (
                !targetPiece ||
                targetPiece.color === color ||
                targetPiece.type === "k"
              )
                return;
              attacks.push({
                move_uci: move.from + move.to + (move.promotion || ""),
                blocker_from: move.from,
                revealed_attacker_square: slider.square,
                revealed_attacker_type: afterPiece.type,
                target_square: targetSquare,
                target_piece: pieceCode(targetPiece),
                target_value: PIECE_VALUES[targetPiece.type] || 0,
              });
            });
          });
          if (checkingPieces.length === 1) {
            checks.push({
              move_uci: move.from + move.to + (move.promotion || ""),
              blocker_from: move.from,
              revealed_attacker_square: checkingPieces[0],
              revealed_attacker_type:
                afterBoard.get(checkingPieces[0])?.type || "",
              target_square: afterKing,
              target_piece: "k",
              target_value: 0,
              is_check: true,
            });
          } else if (checkingPieces.length >= 2) {
            doubleChecks.push({
              move_uci: move.from + move.to + (move.promotion || ""),
              checking_pieces: checkingPieces.slice(0, 2),
            });
          }
        });
      return {
        attacks: attacks.slice(0, 8),
        checks: checks.slice(0, 6),
        double_checks: doubleChecks.slice(0, 4),
      };
    } catch (_) {
      return { attacks: [], checks: [], double_checks: [] };
    }
  }

  function detectXRayAttacks(boardMap, color) {
    try {
      const enemy = color === "w" ? "b" : "w";
      const results = [];
      const sliders = pieceList(boardMap, color, ["b", "r", "q"]);
      sliders.forEach(({ square, piece }) => {
        const directions = [];
        if (piece.type === "b" || piece.type === "q")
          directions.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
        if (piece.type === "r" || piece.type === "q")
          directions.push([1, 0], [-1, 0], [0, 1], [0, -1]);
        const origin = squareCoords(square);
        directions.forEach(([df, dr]) => {
          let file = origin.file + df;
          let rank = origin.rank + dr;
          let screen = null;
          while (file >= 0 && file < 8 && rank >= 0 && rank < 8) {
            const targetSquare = squareFromFileRank(file, rank);
            const targetPiece = boardMap.get(targetSquare);
            if (!targetPiece) {
              file += df;
              rank += dr;
              continue;
            }
            if (!screen) {
              screen = { square: targetSquare, piece: targetPiece };
              file += df;
              rank += dr;
              continue;
            }
            if (
              screen.piece.color === enemy &&
              targetPiece.color === enemy &&
              (PIECE_VALUES[targetPiece.type] || 0) >
                (PIECE_VALUES[screen.piece.type] || 0)
            ) {
              results.push({
                attacker_square: square,
                attacker_type: piece.type,
                screen_square: screen.square,
                screen_piece: pieceCode(screen.piece),
                target_square: targetSquare,
                target_piece: pieceCode(targetPiece),
                target_value: PIECE_VALUES[targetPiece.type] || 0,
              });
            }
            if (screen.piece.color === color && targetPiece.color === enemy) {
              results.push({
                attacker_square: square,
                attacker_type: piece.type,
                screen_square: screen.square,
                screen_piece: pieceCode(screen.piece),
                target_square: targetSquare,
                target_piece: pieceCode(targetPiece),
                target_value: PIECE_VALUES[targetPiece.type] || 0,
              });
            }
            break;
          }
        });
      });
      return results.slice(0, 10);
    } catch (_) {
      return [];
    }
  }

  function detectEscapeSquares(boardMap, color, attackMap, game) {
    try {
      const kingSquare = findKingSquare(boardMap, color);
      const king = kingSquare ? boardMap.get(kingSquare) : null;
      if (!kingSquare || !king)
        return { safe_squares: [], count: 0, luft_possible: false };
      const safeSquares = attackSquaresForPiece(
        boardMap,
        kingSquare,
        king,
      ).filter((square) => {
        const occupant = boardMap.get(square);
        const entry = getAttackEntry(attackMap, square);
        const enemyAttackers = color === "w" ? entry.black : entry.white;
        return (
          (!occupant || occupant.color !== color) && !enemyAttackers.length
        );
      });
      const legalMoves = game?.moves?.({ verbose: true }) || [];
      const luftPossible = legalMoves.some((move) => {
        const piece = boardMap.get(move.from);
        return (
          piece?.color === color &&
          piece.type === "p" &&
          /^[gh]/.test(move.from)
        );
      });
      return {
        safe_squares: safeSquares,
        count: safeSquares.length,
        luft_possible: luftPossible,
      };
    } catch (_) {
      return { safe_squares: [], count: 0, luft_possible: false };
    }
  }

  function detectBackRankWeakness(boardMap, color, attackMap, game = null) {
    try {
      const kingSquare = findKingSquare(boardMap, color);
      const coords = squareCoords(kingSquare);
      const homeRank = color === "w" ? 0 : 7;
      const enemy = color === "w" ? "b" : "w";
      if (!coords || coords.rank !== homeRank)
        return {
          weak: false,
          score: 0,
          escape_squares: 0,
          luft_possible: false,
          enemy_heavy_access: false,
        };
      const sameRankNeighbors = [
        squareFromFileRank(coords.file - 1, homeRank),
        squareFromFileRank(coords.file + 1, homeRank),
      ].filter(Boolean);
      const blockedSides = sameRankNeighbors.every((square) => {
        const piece = boardMap.get(square);
        return piece && piece.color === color;
      });
      const escapeSquares = detectEscapeSquares(
        boardMap,
        color,
        attackMap,
        game,
      );
      let enemyHeavyAccess = false;
      const backRank = color === "w" ? "1" : "8";
      const enemyHeavyPieces = pieceList(boardMap, enemy, ["r", "q"]);
      for (const { square, piece } of enemyHeavyPieces) {
        const pieceCoords = squareCoords(square);
        const pathToBackRank = [];
        if (piece.type === "r") {
          if (pieceCoords.file === coords.file) {
            const dir = color === "w" ? 1 : -1;
            for (
              let r = pieceCoords.rank + dir;
              dir > 0 ? r <= 7 : r >= 0;
              r += dir
            ) {
              const sq = squareFromFileRank(coords.file, r);
              if (!sq) break;
              const intervening = boardMap.get(sq);
              if (intervening) {
                if (intervening.color === color && sq !== kingSquare) break;
                if (intervening.color === enemy) pathToBackRank.push(sq);
                break;
              }
              pathToBackRank.push(sq);
            }
          } else if (pieceCoords.rank === coords.rank) {
            const dir = Math.sign(coords.file - pieceCoords.file);
            for (let f = pieceCoords.file + dir; f >= 0 && f <= 7; f += dir) {
              const sq = squareFromFileRank(f, coords.rank);
              if (!sq) break;
              const intervening = boardMap.get(sq);
              if (intervening) {
                if (intervening.color === color && sq !== kingSquare) break;
                if (intervening.color === enemy) pathToBackRank.push(sq);
                break;
              }
              pathToBackRank.push(sq);
            }
          }
        } else if (piece.type === "q") {
          const df = Math.sign(coords.file - pieceCoords.file);
          const dr = Math.sign(coords.rank - pieceCoords.rank);
          if (
            Math.abs(coords.file - pieceCoords.file) ===
            Math.abs(coords.rank - pieceCoords.rank)
          ) {
            let f = pieceCoords.file + df;
            let r = pieceCoords.rank + dr;
            while (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
              const sq = squareFromFileRank(f, r);
              if (!sq) break;
              const intervening = boardMap.get(sq);
              if (intervening) {
                if (intervening.color === color && sq !== kingSquare) break;
                if (intervening.color === enemy) pathToBackRank.push(sq);
                break;
              }
              pathToBackRank.push(sq);
              f += df;
              r += dr;
            }
          }
          if (
            !pathToBackRank.includes(kingSquare) &&
            pieceCoords.file === coords.file
          ) {
            const dir = color === "w" ? 1 : -1;
            for (
              let r = pieceCoords.rank + dir;
              dir > 0 ? r <= 7 : r >= 0;
              r += dir
            ) {
              const sq = squareFromFileRank(coords.file, r);
              if (!sq) break;
              const intervening = boardMap.get(sq);
              if (intervening) {
                if (intervening.color === color && sq !== kingSquare) break;
                if (intervening.color === enemy) pathToBackRank.push(sq);
                break;
              }
              pathToBackRank.push(sq);
            }
          }
          if (
            !pathToBackRank.includes(kingSquare) &&
            pieceCoords.rank === coords.rank
          ) {
            const dir = Math.sign(coords.file - pieceCoords.file);
            for (let f = pieceCoords.file + dir; f >= 0 && f <= 7; f += dir) {
              const sq = squareFromFileRank(f, coords.rank);
              if (!sq) break;
              const intervening = boardMap.get(sq);
              if (intervening) {
                if (intervening.color === color && sq !== kingSquare) break;
                if (intervening.color === enemy) pathToBackRank.push(sq);
                break;
              }
              pathToBackRank.push(sq);
            }
          }
        }
        if (pathToBackRank.includes(kingSquare)) {
          enemyHeavyAccess = true;
          break;
        }
      }
      let score = 0;
      if (blockedSides && enemyHeavyAccess) score = 2;
      else if (blockedSides || enemyHeavyAccess) score = 1;
      if (blockedSides && enemyHeavyAccess && !escapeSquares.count) {
        let hasBackRankMate = false;
        if (game && enemyHeavyAccess) {
          const enemyFenParts = game.fen().split(" ");
          enemyFenParts[1] = enemy;
          enemyFenParts[3] = "-";
          const enemyFen = enemyFenParts.join(" ");
          const probe = new Chess(enemyFen);
          const backRankSquaresForColor =
            color === "w"
              ? ["a1", "b1", "c1", "d1", "e1", "f1", "g1", "h1"]
              : ["a8", "b8", "c8", "d8", "e8", "f8", "g8", "h8"];
          const heavyToBackRankMoves = probe
            .moves({ verbose: true })
            .filter(
              (m) =>
                (m.piece === "r" || m.piece === "q") &&
                backRankSquaresForColor.includes(m.to),
            );
          for (const move of heavyToBackRankMoves) {
            probe.load(enemyFen);
            const played = probe.move({
              from: move.from,
              to: move.to,
              promotion: move.promotion || undefined,
            });
            if (!played) continue;
            if (probe.in_checkmate?.()) {
              hasBackRankMate = true;
              break;
            }
          }
        }
        score = hasBackRankMate ? 3 : 2;
      }
      return {
        weak: score > 0,
        score,
        escape_squares: escapeSquares.count,
        luft_possible: escapeSquares.luft_possible,
        enemy_heavy_access: enemyHeavyAccess,
      };
    } catch (_) {
      return {
        weak: false,
        score: 0,
        escape_squares: 0,
        luft_possible: false,
        enemy_heavy_access: false,
      };
    }
  }

  function detectTrappedPieces(
    boardMap,
    color,
    legalMovesForColor,
    attackMap = null,
    opponentLegalMoves = [],
  ) {
    try {
      const nonPawnCount = pieceList(boardMap, color).filter(
        ({ piece }) => piece.type !== "p" && piece.type !== "k",
      ).length;
      if (nonPawnCount < 3) return [];
      const byPiece = new Map();
      (legalMovesForColor || []).forEach((move) => {
        const piece = boardMap.get(move.from);
        if (
          !piece ||
          piece.color !== color ||
          piece.type === "p" ||
          piece.type === "k"
        )
          return;
        if (!byPiece.has(move.from)) byPiece.set(move.from, []);
        byPiece.get(move.from).push(move);
      });
      const result = [];
      for (const [square, moves] of byPiece.entries()) {
        const piece = boardMap.get(square);
        const safeMoves = moves.filter(
          (move) =>
            computeSEE(
              boardMap,
              move.to,
              color === "w" ? "b" : "w",
              attackMap,
            ) <= 0,
        );
        if (safeMoves.length > 0) continue;
        result.push({
          square,
          piece_type: piece?.type || "",
          safe_destinations: safeMoves.length,
          can_be_sealed_next_move: false,
        });
      }
      return result.slice(0, 8);
    } catch (_) {
      return [];
    }
  }

  function detectDesperadoMoves(
    boardMap,
    color,
    legalMovesForColor,
    attackMap,
  ) {
    try {
      if (!Array.isArray(legalMovesForColor) || legalMovesForColor.length > 50)
        return [];
      const trappedSet = new Set(
        detectTrappedPieces(boardMap, color, legalMovesForColor, attackMap).map(
          (entry) => entry.square,
        ),
      );
      const result = [];
      for (const [square, piece] of boardMap.entries()) {
        if (piece.color !== color || piece.type === "p" || piece.type === "k")
          continue;
        const entry = getAttackEntry(attackMap, square);
        const enemyAttackers = color === "w" ? entry.black : entry.white;
        if (!enemyAttackers.length && !trappedSet.has(square)) continue;
        const captures = legalMovesForColor.filter(
          (move) =>
            move.from === square &&
            (String(move.flags || "").includes("c") ||
              String(move.flags || "").includes("e")),
        );
        if (!captures.length) continue;
        const bestCapture = captures
          .map((move) => ({
            move,
            target: captureTargetFromMove(
              { get: (targetSquare) => boardMap.get(targetSquare) },
              move,
            ),
          }))
          .sort((a, b) => (b.target?.value || 0) - (a.target?.value || 0))[0];
        if (!bestCapture) continue;
        result.push({
          square,
          piece: pieceCode(piece),
          best_capture_san: bestCapture.move.san,
          material_gained:
            (bestCapture.target?.value || 0) - (PIECE_VALUES[piece.type] || 0),
        });
      }
      return result.slice(0, 6);
    } catch (_) {
      return [];
    }
  }

  function detectCrossChecks(boardMap, color, game) {
    try {
      if (!game?.in_check?.()) return [];
      const baseFen = game.fen();
      const probe = new Chess(baseFen);
      return game
        .moves({ verbose: true })
        .filter((move) => (boardMap.get(move.from)?.color || "") === color)
        .map((move) => {
          probe.load(baseFen);
          const played = probe.move({
            from: move.from,
            to: move.to,
            promotion: move.promotion || undefined,
          });
          if (!played) return null;
          return probe.in_check?.()
            ? {
                response_move_uci: move.from + move.to + (move.promotion || ""),
                checking_piece_square: move.to,
              }
            : null;
        })
        .filter(Boolean)
        .slice(0, 6);
    } catch (_) {
      return [];
    }
  }

  function detectBackwardPawns(boardMap, color) {
    try {
      const enemy = color === "w" ? "b" : "w";
      const result = [];
      for (const [square, piece] of boardMap.entries()) {
        if (piece.color !== color || piece.type !== "p") continue;
        const coords = squareCoords(square);
        const frontSquare = squareFromFileRank(
          coords.file,
          coords.rank + (color === "w" ? 1 : -1),
        );
        if (!frontSquare) continue;
        let supportExists = false;
        [-1, 1].forEach((df) => {
          for (const [otherSquare, otherPiece] of boardMap.entries()) {
            if (otherPiece.color !== color || otherPiece.type !== "p") continue;
            const other = squareCoords(otherSquare);
            if (other.file !== coords.file + df) continue;
            if (
              color === "w"
                ? other.rank <= coords.rank
                : other.rank >= coords.rank
            )
              supportExists = true;
          }
        });
        if (supportExists) continue;
        const enemyPawnAttackers = squareAttackers(
          boardMap,
          frontSquare,
          enemy,
        ).filter((attacker) => attacker.type === "p");
        const advancingLoses = enemyPawnAttackers.length > 0;
        if (!enemyPawnAttackers.length && !advancingLoses) continue;
        const fileInfo = openFileProfile(boardMap);
        const letter = fileLetter(coords.file);
        result.push({
          square,
          front_square: frontSquare,
          on_open_file: fileInfo.open.includes(letter),
          weakness_score: fileInfo.open.includes(letter) ? 2 : 1,
        });
      }
      return result;
    } catch (_) {
      return [];
    }
  }

  function detectHangingPawnPair(boardMap, color) {
    try {
      const pawns = pieceList(boardMap, color, ["p"]);
      for (let i = 0; i < pawns.length; i += 1) {
        for (let j = i + 1; j < pawns.length; j += 1) {
          const a = squareCoords(pawns[i].square);
          const b = squareCoords(pawns[j].square);
          if (a.rank !== b.rank || Math.abs(a.file - b.file) !== 1) continue;
          const leftOuter = squareFromFileRank(
            Math.min(a.file, b.file) - 1,
            a.rank,
          );
          const rightOuter = squareFromFileRank(
            Math.max(a.file, b.file) + 1,
            a.rank,
          );
          const leftOuterPiece = leftOuter ? boardMap.get(leftOuter) : null;
          const rightOuterPiece = rightOuter ? boardMap.get(rightOuter) : null;
          if (
            (leftOuterPiece?.color === color && leftOuterPiece.type === "p") ||
            (rightOuterPiece?.color === color && rightOuterPiece.type === "p")
          )
            continue;
          return { present: true, squares: [pawns[i].square, pawns[j].square] };
        }
      }
      return { present: false, squares: [] };
    } catch (_) {
      return { present: false, squares: [] };
    }
  }

  function detectCandidatePassedPawns(boardMap, color) {
    try {
      const enemy = color === "w" ? "b" : "w";
      const result = [];
      for (const [square, piece] of boardMap.entries()) {
        if (
          piece.color !== color ||
          piece.type !== "p" ||
          isPassedPawn(boardMap, square, color)
        )
          continue;
        const coords = squareCoords(square);
        let enemyCount = 0;
        let adjacentOnly = true;
        for (const [otherSquare, otherPiece] of boardMap.entries()) {
          if (otherPiece.color !== enemy || otherPiece.type !== "p") continue;
          const other = squareCoords(otherSquare);
          if (Math.abs(other.file - coords.file) > 1) continue;
          if (
            color === "w"
              ? other.rank <= coords.rank
              : other.rank >= coords.rank
          )
            continue;
          enemyCount += 1;
          if (other.file === coords.file) adjacentOnly = false;
        }
        if (enemyCount === 1 && adjacentOnly) {
          result.push({
            square,
            file: fileLetter(coords.file),
            blocking_enemy_count: 1,
          });
        }
      }
      return result;
    } catch (_) {
      return [];
    }
  }

  function detectPawnTension(boardMap) {
    try {
      const result = [];
      for (const [square, piece] of boardMap.entries()) {
        if (piece.type !== "p" || piece.color !== "w") continue;
        const attacks = attackSquaresForPiece(boardMap, square, piece);
        attacks.forEach((targetSquare) => {
          const target = boardMap.get(targetSquare);
          if (target?.type === "p" && target.color === "b") {
            result.push({ white_pawn: square, black_pawn: targetSquare });
          }
        });
      }
      return result;
    } catch (_) {
      return [];
    }
  }

  function detectTripledPawns(boardMap, color) {
    try {
      const files = pawnFilesForColor(boardMap, color);
      const result = [];
      for (const [file, pawns] of files.entries()) {
        if (pawns.length < 3) continue;
        result.push({
          file: fileLetter(file),
          squares: pawns
            .slice()
            .sort((a, b) => a.rank - b.rank)
            .map((entry) => entry.square),
        });
      }
      return result;
    } catch (_) {
      return [];
    }
  }

  function detectPassedPawnFeatures(boardMap, color) {
    try {
      const enemy = color === "w" ? "b" : "w";
      const result = [];
      for (const [square, piece] of boardMap.entries()) {
        if (
          piece.color !== color ||
          piece.type !== "p" ||
          !isPassedPawn(boardMap, square, color)
        )
          continue;
        const coords = squareCoords(square);
        const forward = color === "w" ? 1 : -1;
        let connectedTo = null;
        [-1, 1].forEach((df) => {
          const sideSquare = squareFromFileRank(coords.file + df, coords.rank);
          const sidePiece = sideSquare ? boardMap.get(sideSquare) : null;
          if (sidePiece?.color === color && sidePiece.type === "p")
            connectedTo = sideSquare;
        });
        let ownRookBehind = false;
        let enemyRookBehind = false;
        for (
          let rank = coords.rank - forward;
          rank >= 0 && rank < 8;
          rank -= forward
        ) {
          const scanSquare = squareFromFileRank(coords.file, rank);
          const scanPiece = boardMap.get(scanSquare);
          if (!scanPiece) continue;
          if (scanPiece.type === "r") {
            if (scanPiece.color === color) ownRookBehind = true;
            else enemyRookBehind = true;
          }
          break;
        }
        let blockadedBy = null;
        const frontSquare = squareFromFileRank(
          coords.file,
          coords.rank + forward,
        );
        const frontPiece = frontSquare ? boardMap.get(frontSquare) : null;
        if (frontPiece && frontPiece.color === enemy) {
          blockadedBy = { square: frontSquare, piece_type: frontPiece.type };
        }
        result.push({
          square,
          protected_by_pawn: isPawnDefendedSquare(boardMap, color, square),
          connected_to: connectedTo,
          has_own_rook_behind: ownRookBehind,
          has_enemy_rook_behind: enemyRookBehind,
          blockaded_by: blockadedBy,
          moves_to_promote: color === "w" ? 7 - coords.rank : coords.rank,
        });
      }
      return result;
    } catch (_) {
      return [];
    }
  }

  function detectPawnMajority(boardMap) {
    try {
      const countSide = (color, fileMin, fileMax) => {
        let total = 0;
        for (const [square, piece] of boardMap.entries()) {
          const coords = squareCoords(square);
          if (
            piece.color === color &&
            piece.type === "p" &&
            coords.file >= fileMin &&
            coords.file <= fileMax
          )
            total += 1;
        }
        return total;
      };
      const result = {
        white: {
          queenside: countSide("w", 0, 3),
          kingside: countSide("w", 4, 7),
        },
        black: {
          queenside: countSide("b", 0, 3),
          kingside: countSide("b", 4, 7),
        },
        verdict: "balanced",
      };
      if (result.white.queenside > result.black.queenside)
        result.verdict = "white_queenside";
      else if (result.black.queenside > result.white.queenside)
        result.verdict = "black_queenside";
      else if (result.white.kingside > result.black.kingside)
        result.verdict = "white_kingside";
      else if (result.black.kingside > result.white.kingside)
        result.verdict = "black_kingside";
      return result;
    } catch (_) {
      return {
        white: { queenside: 0, kingside: 0 },
        black: { queenside: 0, kingside: 0 },
        verdict: "balanced",
      };
    }
  }

  function detectPawnDuos(boardMap, color) {
    try {
      const result = [];
      const pawns = pieceList(boardMap, color, ["p"]);
      for (let i = 0; i < pawns.length; i += 1) {
        for (let j = i + 1; j < pawns.length; j += 1) {
          const a = squareCoords(pawns[i].square);
          const b = squareCoords(pawns[j].square);
          if (a.rank === b.rank && Math.abs(a.file - b.file) === 1) {
            result.push({
              file1: fileLetter(Math.min(a.file, b.file)),
              file2: fileLetter(Math.max(a.file, b.file)),
              rank: a.rank + 1,
              squares: [pawns[i].square, pawns[j].square],
            });
          }
        }
      }
      return result;
    } catch (_) {
      return [];
    }
  }

  function detectStructuralArchetype(boardMap) {
    try {
      const has = (square, type = "p", color = null) => {
        const piece = boardMap.get(square);
        return (
          !!piece && piece.type === type && (!color || piece.color === color)
        );
      };
      if (
        has("c3", "p", "w") &&
        has("d4", "p", "w") &&
        has("c6", "p", "b") &&
        has("d5", "p", "b") &&
        has("e6", "p", "b")
      ) {
        return {
          name: "Carlsbad",
          confidence: "high",
          characteristics: ["minority_attack", "queenside_targets"],
        };
      }
      if (
        (has("c3", "p", "w") && has("d4", "p", "w") && has("e3", "p", "w")) ||
        (has("c6", "p", "b") && has("d5", "p", "b") && has("e6", "p", "b"))
      ) {
        return {
          name: "Stonewall",
          confidence: "medium",
          characteristics: ["fixed_center", "color_complex"],
        };
      }
      if (
        has("c4", "p", "w") &&
        has("e4", "p", "w") &&
        (has("d6", "p", "b") || has("e5", "p", "b"))
      ) {
        return {
          name: "Maroczy Bind",
          confidence: "medium",
          characteristics: ["space_advantage", "restrained_counterplay"],
        };
      }
      if (
        has("a6", "p", "b") &&
        has("b6", "p", "b") &&
        has("d6", "p", "b") &&
        has("e6", "p", "b")
      ) {
        return {
          name: "Hedgehog",
          confidence: "medium",
          characteristics: ["compact_center", "latent_breaks"],
        };
      }
      const whiteD =
        boardMap.get("d4")?.color === "w" || boardMap.get("d3")?.color === "w";
      const blackD =
        boardMap.get("d5")?.color === "b" || boardMap.get("d6")?.color === "b";
      if (whiteD && !blackD)
        return {
          name: "IQP",
          confidence: "medium",
          characteristics: ["isolated_d_pawn", "piece_activity"],
        };
      if (blackD && !whiteD)
        return {
          name: "IQP",
          confidence: "medium",
          characteristics: ["isolated_d_pawn", "piece_activity"],
        };
      return { name: null, confidence: "low", characteristics: [] };
    } catch (_) {
      return { name: null, confidence: "low", characteristics: [] };
    }
  }

  function detectColorComplexWeakness(boardMap, color) {
    try {
      const kingSquare = findKingSquare(boardMap, color);
      const kingCoords = squareCoords(kingSquare);
      let light = 0;
      let dark = 0;
      allBoardSquares().forEach((square) => {
        const coords = squareCoords(square);
        const piece = boardMap.get(square);
        const inBand = coords.rank >= 2 && coords.rank <= 5;
        const nearKing = kingCoords
          ? chebyshevDistance(square, kingSquare) <= 2
          : false;
        if (!inBand && !nearKing) return;
        if (piece?.color === color) return;
        if (isPawnDefendedSquare(boardMap, color, square)) return;
        if (squareColorComplex(square) === "light") light += 1;
        else dark += 1;
      });
      const friendlyBishops = pieceList(boardMap, color, ["b"]);
      friendlyBishops.forEach(({ square }) => {
        if (squareColorComplex(square) === "light")
          light = Math.max(0, light - 1);
        else dark = Math.max(0, dark - 1);
      });
      return {
        light_square_score: light,
        dark_square_score: dark,
        dominant_weakness:
          light === dark ? "none" : light > dark ? "light" : "dark",
      };
    } catch (_) {
      return {
        light_square_score: 0,
        dark_square_score: 0,
        dominant_weakness: "none",
      };
    }
  }

  function detectWrongBishop(boardMap, color) {
    try {
      const bishops = pieceList(boardMap, color, ["b"]);
      if (bishops.length !== 1)
        return {
          present: false,
          bishop_square: null,
          pawn_square: null,
          promo_square: null,
        };
      const passedPawns = detectPassedPawnFeatures(boardMap, color).filter(
        (entry) => /^[ah]/.test(entry.square),
      );
      if (passedPawns.length !== 1)
        return {
          present: false,
          bishop_square: null,
          pawn_square: null,
          promo_square: null,
        };
      const bishopSquare = bishops[0].square;
      const promoSquare =
        passedPawns[0].square[0] === "a"
          ? color === "w"
            ? "a8"
            : "a1"
          : color === "w"
            ? "h8"
            : "h1";
      const wrong =
        squareColorComplex(bishopSquare) !== squareColorComplex(promoSquare);
      return {
        present: wrong,
        bishop_square: bishopSquare,
        pawn_square: passedPawns[0].square,
        promo_square: promoSquare,
      };
    } catch (_) {
      return {
        present: false,
        bishop_square: null,
        pawn_square: null,
        promo_square: null,
      };
    }
  }

  function detectKnightOutposts(boardMap, color) {
    try {
      const occupied = [];
      const available = [];
      const enemy = color === "w" ? "b" : "w";
      const knights = pieceList(boardMap, color, ["n"]);
      allBoardSquares().forEach((square) => {
        const coords = squareCoords(square);
        const occupant = boardMap.get(square);
        const rankOkay = color === "w" ? coords.rank >= 4 : coords.rank <= 3;
        if (!rankOkay) return;
        if (!isPawnDefendedSquare(boardMap, color, square)) return;
        let enemyPawnCanHit = false;
        for (const [otherSquare, piece] of boardMap.entries()) {
          if (piece.color !== enemy || piece.type !== "p") continue;
          if (
            attackSquaresForPiece(boardMap, otherSquare, piece).includes(square)
          ) {
            enemyPawnCanHit = true;
            break;
          }
        }
        if (enemyPawnCanHit) return;
        if (occupant?.color === color && occupant.type === "n") {
          occupied.push({ square, knight_square: square });
        } else if (!occupant) {
          const reachable = knights.some(
            ({ square: knightSquare, piece: knight }) => {
              const oneMove = attackSquaresForPiece(
                boardMap,
                knightSquare,
                knight,
              );
              if (oneMove.includes(square)) return true;
              return oneMove.some((mid) =>
                attackSquaresForPiece(boardMap, mid, {
                  type: "n",
                  color,
                }).includes(square),
              );
            },
          );
          if (reachable) available.push(square);
        }
      });
      return { occupied, available };
    } catch (_) {
      return { occupied: [], available: [] };
    }
  }

  function detectBadBishops(boardMap, color) {
    try {
      const ownPawns = pieceList(boardMap, color, ["p"]);
      return pieceList(boardMap, color, ["b"]).map(({ square }) => {
        const complex = squareColorComplex(square);
        const ownPawnsSameColor = ownPawns.filter(
          ({ square: pawnSquare }) =>
            squareColorComplex(pawnSquare) === complex,
        ).length;
        const totalOwnPawns = ownPawns.length;
        const badScore = ownPawnsSameColor / Math.max(1, totalOwnPawns);
        return {
          square,
          bishop_color_complex: complex,
          own_pawns_on_same_color: ownPawnsSameColor,
          total_own_pawns: totalOwnPawns,
          bad_score: Number(badScore.toFixed(2)),
          is_bad: ownPawnsSameColor >= 3 || badScore > 0.55,
        };
      });
    } catch (_) {
      return [];
    }
  }

  function detectBishopPair(boardMap) {
    try {
      const whiteBishops = pieceList(boardMap, "w", ["b"]).map(
        (entry) => entry.square,
      );
      const blackBishops = pieceList(boardMap, "b", ["b"]).map(
        (entry) => entry.square,
      );
      const phase = detectGamePhase(boardMap);
      const openPosition = phase === "opening" || phase === "middlegame";
      const whitePair =
        whiteBishops.length >= 2 &&
        new Set(whiteBishops.map(squareColorComplex)).size >= 2;
      const blackPair =
        blackBishops.length >= 2 &&
        new Set(blackBishops.map(squareColorComplex)).size >= 2;
      return {
        white: whitePair,
        black: blackPair,
        white_on_open_position: whitePair && openPosition,
        black_on_open_position: blackPair && openPosition,
      };
    } catch (_) {
      return {
        white: false,
        black: false,
        white_on_open_position: false,
        black_on_open_position: false,
      };
    }
  }

  function detectRookActivity(boardMap, color) {
    try {
      const fileProfile = openFileProfile(boardMap);
      const passers = new Set(
        detectPassedPawnFeatures(boardMap, color).map((entry) => entry.square),
      );
      const enemyPassers = new Set(
        detectPassedPawnFeatures(boardMap, color === "w" ? "b" : "w").map(
          (entry) => entry.square,
        ),
      );
      return pieceList(boardMap, color, ["r"]).map(({ square }) => {
        const coords = squareCoords(square);
        const targetsOnRank = [];
        for (let file = 0; file < 8; file += 1) {
          const targetSquare = squareFromFileRank(file, coords.rank);
          const targetPiece = boardMap.get(targetSquare);
          if (targetPiece && targetPiece.color !== color)
            targetsOnRank.push(targetSquare);
        }
        return {
          square,
          on_open_file: fileProfile.open.includes(fileLetter(coords.file)),
          on_semi_open_file: fileProfile.semi_open[
            color === "w" ? "white" : "black"
          ].includes(fileLetter(coords.file)),
          on_7th_rank: color === "w" ? coords.rank === 6 : coords.rank === 1,
          behind_own_passer: Array.from(passers).some(
            (pawnSquare) => pawnSquare[0] === square[0],
          ),
          behind_enemy_passer: Array.from(enemyPassers).some(
            (pawnSquare) => pawnSquare[0] === square[0],
          ),
          targets_on_rank: targetsOnRank,
        };
      });
    } catch (_) {
      return [];
    }
  }

  function detectConnectedRooks(boardMap, color) {
    try {
      const rooks = pieceList(boardMap, color, ["r"]);
      if (rooks.length < 2)
        return { connected: false, squares: [], battery_on: null };
      for (let i = 0; i < rooks.length; i += 1) {
        for (let j = i + 1; j < rooks.length; j += 1) {
          const a = squareCoords(rooks[i].square);
          const b = squareCoords(rooks[j].square);
          if (a.file !== b.file && a.rank !== b.rank) continue;
          const df = Math.sign(b.file - a.file);
          const dr = Math.sign(b.rank - a.rank);
          let file = a.file + df;
          let rank = a.rank + dr;
          let blocked = false;
          while (file !== b.file || rank !== b.rank) {
            if (boardMap.has(squareFromFileRank(file, rank))) {
              blocked = true;
              break;
            }
            file += df;
            rank += dr;
          }
          if (!blocked) {
            return {
              connected: true,
              squares: [rooks[i].square, rooks[j].square],
              battery_on:
                a.file === b.file ? fileLetter(a.file) : `${a.rank + 1}`,
            };
          }
        }
      }
      return { connected: false, squares: [], battery_on: null };
    } catch (_) {
      return { connected: false, squares: [], battery_on: null };
    }
  }

  function detectBatteries(boardMap, color) {
    try {
      const result = [];
      const sliders = pieceList(boardMap, color, ["q", "r", "b"]);
      for (let i = 0; i < sliders.length; i += 1) {
        for (let j = i + 1; j < sliders.length; j += 1) {
          const a = squareCoords(sliders[i].square);
          const b = squareCoords(sliders[j].square);
          const sameFile = a.file === b.file;
          const sameRank = a.rank === b.rank;
          const sameDiag =
            Math.abs(a.file - b.file) === Math.abs(a.rank - b.rank);
          if (!sameFile && !sameRank && !sameDiag) continue;
          const df = Math.sign(b.file - a.file);
          const dr = Math.sign(b.rank - a.rank);
          let file = a.file + df;
          let rank = a.rank + dr;
          let blockers = 0;
          while (file !== b.file || rank !== b.rank) {
            if (boardMap.has(squareFromFileRank(file, rank))) blockers += 1;
            file += df;
            rank += dr;
          }
          if (blockers) continue;
          const targets = [];
          let scanFile = b.file + df;
          let scanRank = b.rank + dr;
          while (
            scanFile >= 0 &&
            scanFile < 8 &&
            scanRank >= 0 &&
            scanRank < 8
          ) {
            const targetSquare = squareFromFileRank(scanFile, scanRank);
            const targetPiece = boardMap.get(targetSquare);
            if (targetPiece && targetPiece.color !== color)
              targets.push(targetSquare);
            if (targetPiece) break;
            scanFile += df;
            scanRank += dr;
          }
          result.push({
            pieces: [sliders[i].square, sliders[j].square],
            line_type: sameFile ? "file" : sameRank ? "rank" : "diagonal",
            target_direction: sameFile
              ? fileLetter(a.file)
              : sameRank
                ? `${a.rank + 1}`
                : df === dr
                  ? "a1h8"
                  : "a8h1",
            targets,
          });
        }
      }
      return result.slice(0, 8);
    } catch (_) {
      return [];
    }
  }

  function detectDevelopmentStatus(boardMap, color, fenCastlingField) {
    try {
      const starts =
        color === "w"
          ? [
              { square: "b1", type: "n" },
              { square: "g1", type: "n" },
              { square: "c1", type: "b" },
              { square: "f1", type: "b" },
            ]
          : [
              { square: "b8", type: "n" },
              { square: "g8", type: "n" },
              { square: "c8", type: "b" },
              { square: "f8", type: "b" },
            ];
      const undeveloped = [];
      let developedMinors = 0;
      starts.forEach(({ square, type }) => {
        const piece = boardMap.get(square);
        if (piece?.color === color && piece.type === type)
          undeveloped.push({ square, piece_type: type });
        else developedMinors += 1;
      });
      const kingSquare = findKingSquare(boardMap, color);
      const rightsToken = String(fenCastlingField || "-");
      const canCastle =
        color === "w" ? /[KQ]/.test(rightsToken) : /[kq]/.test(rightsToken);
      const hasCastled =
        color === "w"
          ? ["g1", "c1"].includes(kingSquare)
          : ["g8", "c8"].includes(kingSquare);
      const lostCastlingRights =
        !canCastle &&
        (color === "w" ? kingSquare === "e1" : kingSquare === "e8");
      return {
        developed_minors: developedMinors,
        undeveloped,
        can_castle: canCastle,
        has_castled: hasCastled,
        lost_castling_rights: lostCastlingRights,
        development_score:
          developedMinors * 2 + (hasCastled ? 2 : canCastle ? 0 : -1),
      };
    } catch (_) {
      return {
        developed_minors: 0,
        undeveloped: [],
        can_castle: false,
        has_castled: false,
        lost_castling_rights: false,
        development_score: 0,
      };
    }
  }

  function detectKingTropism(boardMap, color) {
    try {
      const kingSquare = findKingSquare(boardMap, color);
      const enemy = color === "w" ? "b" : "w";
      const attackers = [];
      let score = 0;
      pieceList(boardMap, enemy).forEach(({ square, piece }) => {
        if (piece.type === "k") return;
        const distance = chebyshevDistance(square, kingSquare);
        const weight =
          Math.min(PIECE_VALUES[piece.type] || 0, 4) / Math.max(1, distance);
        score += weight;
        attackers.push({
          square,
          piece_type: piece.type,
          chebyshev_distance: distance,
          weight: Number(weight.toFixed(2)),
        });
      });
      attackers.sort((a, b) => b.weight - a.weight);
      return {
        score: Number(score.toFixed(2)),
        attackers: attackers.slice(0, 8),
      };
    } catch (_) {
      return { score: 0, attackers: [] };
    }
  }

  function detectQueenExposure(boardMap, color, legalMoves) {
    try {
      const queens = pieceList(boardMap, color, ["q"]);
      if (!queens.length) return [];
      const queenSquare = queens[0].square;
      return (legalMoves || [])
        .filter((move) => {
          const attacker = boardMap.get(move.from);
          if (!attacker || attacker.color === color) return false;
          if ((PIECE_VALUES[attacker.type] || 0) >= 9) return false;
          const nextBoard = new Map(boardMap);
          nextBoard.delete(move.from);
          nextBoard.set(move.to, attacker);
          return attackSquaresForPiece(nextBoard, move.to, attacker).includes(
            queenSquare,
          );
        })
        .map((move) => {
          const attacker = boardMap.get(move.from);
          return {
            queen_square: queenSquare,
            tempo_attacks: [
              {
                attacker_square: move.from,
                attacker_type: attacker?.type || "",
                move_uci: move.from + move.to + (move.promotion || ""),
              },
            ],
          };
        })
        .slice(0, 6);
    } catch (_) {
      return [];
    }
  }

  function detectBestAndWorstPieces(
    boardMap,
    color,
    attackMap,
    mobilityInfo = null,
    outposts = null,
    trappedPieces = null,
  ) {
    try {
      const pieces = pieceList(boardMap, color).filter(
        ({ piece }) => piece.type !== "p" && piece.type !== "k",
      );
      const mobilityMap = new Map(
        (mobilityInfo?.by_piece || []).map((entry) => [
          entry.square,
          entry.legal_moves,
        ]),
      );
      const outpostSet = new Set([
        ...(outposts?.occupied || []).map((entry) => entry.knight_square),
      ]);
      const trappedSet = new Set(
        (trappedPieces || []).map((entry) => entry.square),
      );
      const scored = pieces
        .map(({ square, piece }) => {
          let score =
            mobilityMap.get(square) ||
            attackSquaresForPiece(boardMap, square, piece).length;
          const reasons = [];
          if (outpostSet.has(square)) {
            score += 3;
            reasons.push("outpost");
          }
          const entry = getAttackEntry(attackMap, square);
          const defenders = color === "w" ? entry.white : entry.black;
          const enemies = color === "w" ? entry.black : entry.white;
          if (defenders.length) {
            score += 1;
            reasons.push("defended");
          } else {
            score -= 1;
            reasons.push("undefended");
          }
          const attacks = attackSquaresForPiece(boardMap, square, piece).filter(
            (targetSquare) => {
              const target = boardMap.get(targetSquare);
              return target && target.color !== color;
            },
          );
          if (attacks.length) {
            score += 2;
            reasons.push(
              attacks.some(
                (targetSquare) => boardMap.get(targetSquare)?.type === "q",
              )
                ? "attacking_queen"
                : "active",
            );
          }
          if (enemies.length) score -= 1;
          if (trappedSet.has(square)) {
            score -= 4;
            reasons.push("trapped");
          }
          return {
            square,
            piece_type: piece.type,
            score,
            reasons,
          };
        })
        .sort((a, b) => b.score - a.score || a.square.localeCompare(b.square));
      return {
        best: scored[0] || {
          square: "",
          piece_type: "",
          score: 0,
          reasons: [],
        },
        worst: scored[scored.length - 1] || {
          square: "",
          piece_type: "",
          score: 0,
          reasons: [],
        },
      };
    } catch (_) {
      return {
        best: { square: "", piece_type: "", score: 0, reasons: [] },
        worst: { square: "", piece_type: "", score: 0, reasons: [] },
      };
    }
  }

  function detectCastlingStatus(fen) {
    try {
      const parts = String(fen || "").split(" ");
      const rights = parts[2] || "-";
      const board = new Chess(normalizeToolFen(fen));
      const boardMap = buildBoardMap(board);
      const whiteKing = findKingSquare(boardMap, "w");
      const blackKing = findKingSquare(boardMap, "b");
      return {
        white: /[KQ]/.test(rights)
          ? "can_castle"
          : ["g1", "c1"].includes(whiteKing)
            ? "has_castled"
            : "lost_rights",
        black: /[kq]/.test(rights)
          ? "can_castle"
          : ["g8", "c8"].includes(blackKing)
            ? "has_castled"
            : "lost_rights",
      };
    } catch (_) {
      return { white: "lost_rights", black: "lost_rights" };
    }
  }

  function detectOpenDiagonalsToKing(boardMap, color) {
    try {
      const kingSquare = findKingSquare(boardMap, color);
      const king = squareCoords(kingSquare);
      const enemy = color === "w" ? "b" : "w";
      if (!king) return [];
      const results = [];
      [
        [1, 1, "NE"],
        [1, -1, "SE"],
        [-1, 1, "NW"],
        [-1, -1, "SW"],
      ].forEach(([df, dr, label]) => {
        const squares = [];
        let friendlyBlockersNear = 0;
        let enemySliderSquare = null;
        for (let step = 1; step < 8; step += 1) {
          const square = squareFromFileRank(
            king.file + df * step,
            king.rank + dr * step,
          );
          if (!square) break;
          squares.push(square);
          const piece = boardMap.get(square);
          if (!piece) continue;
          if (piece.color === color && step <= 2) friendlyBlockersNear += 1;
          if (
            piece.color === enemy &&
            (piece.type === "b" || piece.type === "q")
          ) {
            enemySliderSquare = square;
          }
          break;
        }
        if (friendlyBlockersNear === 0 && enemySliderSquare) {
          results.push({
            diagonal_direction: label,
            attacking_piece_square: enemySliderSquare,
            squares_on_ray: squares,
          });
        }
      });
      return results;
    } catch (_) {
      return [];
    }
  }

  function detectKingZoneAttacks(boardMap, color, attackMap) {
    try {
      const kingSquare = findKingSquare(boardMap, color);
      const king = squareCoords(kingSquare);
      const enemy = color === "w" ? "b" : "w";
      if (!king)
        return {
          attack_units: 0,
          attacking_pieces: [],
          attacked_zone_squares: [],
        };
      const zoneSquares = [];
      for (let df = -1; df <= 1; df += 1) {
        for (let dr = -1; dr <= 1; dr += 1) {
          const square = squareFromFileRank(king.file + df, king.rank + dr);
          if (square) zoneSquares.push(square);
        }
      }
      const attackers = new Map();
      const attackedZoneSquares = [];
      zoneSquares.forEach((square) => {
        const entry = getAttackEntry(attackMap, square);
        const enemyAttackers = enemy === "w" ? entry.white : entry.black;
        if (enemyAttackers.length) attackedZoneSquares.push(square);
        enemyAttackers.forEach((attacker) => {
          attackers.set(attacker.square, attacker.type);
        });
      });
      let units = 0;
      const attackingPieces = Array.from(attackers.entries()).map(
        ([square, type]) => {
          const weight = { q: 4, r: 3, b: 2, n: 2, p: 1 }[type] || 1;
          units += weight;
          return { square, type, weight };
        },
      );
      return {
        attack_units: units,
        attacking_pieces: attackingPieces,
        attacked_zone_squares: attackedZoneSquares,
      };
    } catch (_) {
      return {
        attack_units: 0,
        attacking_pieces: [],
        attacked_zone_squares: [],
      };
    }
  }

  function detectDistantOpposition(boardMap, turn = "w") {
    try {
      const whiteKing = findKingSquare(boardMap, "w");
      const blackKing = findKingSquare(boardMap, "b");
      const white = squareCoords(whiteKing);
      const black = squareCoords(blackKing);
      if (!white || !black)
        return {
          present: false,
          type: "none",
          distance: 0,
          side_with_opposition: "none",
        };
      const fileDist = Math.abs(white.file - black.file);
      const rankDist = Math.abs(white.rank - black.rank);
      let type = "none";
      let distance = 0;
      if (
        (fileDist === 0 || rankDist === 0) &&
        (fileDist || rankDist) % 2 === 0 &&
        (fileDist || rankDist) > 0
      ) {
        type = "direct";
        distance = Math.max(fileDist, rankDist) - 1;
      } else if (fileDist === rankDist && fileDist % 2 === 0 && fileDist > 0) {
        type = "diagonal";
        distance = fileDist - 1;
      }
      return {
        present: type !== "none",
        type,
        distance,
        side_with_opposition:
          type === "none" ? "none" : turn === "w" ? "black" : "white",
      };
    } catch (_) {
      return {
        present: false,
        type: "none",
        distance: 0,
        side_with_opposition: "none",
      };
    }
  }

  function detectCenterControl(attackMap, boardMap) {
    try {
      const centerSquares = ["d4", "d5", "e4", "e5"];
      const result = {};
      let whiteTotal = 0;
      let blackTotal = 0;
      centerSquares.forEach((square) => {
        const entry = getAttackEntry(attackMap, square);
        const occupant = boardMap.get(square);
        const whiteCount =
          entry.white.length + (occupant?.color === "w" ? 1 : 0);
        const blackCount =
          entry.black.length + (occupant?.color === "b" ? 1 : 0);
        result[square] = { white: whiteCount, black: blackCount };
        whiteTotal += whiteCount;
        blackTotal += blackCount;
      });
      return {
        ...result,
        white_total: whiteTotal,
        black_total: blackTotal,
        white_advantage: whiteTotal > blackTotal,
      };
    } catch (_) {
      return {
        d4: { white: 0, black: 0 },
        d5: { white: 0, black: 0 },
        e4: { white: 0, black: 0 },
        e5: { white: 0, black: 0 },
        white_total: 0,
        black_total: 0,
        white_advantage: false,
      };
    }
  }

  function detectSpaceScore(boardMap, attackMap, color) {
    try {
      const enemyKey = color === "w" ? "black" : "white";
      const ownKey = color === "w" ? "white" : "black";
      const controlled = [];
      allBoardSquares().forEach((square) => {
        const coords = squareCoords(square);
        if (color === "w" ? coords.rank < 4 : coords.rank > 3) return;
        const entry = getAttackEntry(attackMap, square);
        if ((entry[ownKey] || []).length && !(entry[enemyKey] || []).length)
          controlled.push(square);
      });
      return { score: controlled.length, controlled_squares: controlled };
    } catch (_) {
      return { score: 0, controlled_squares: [] };
    }
  }

  function detectWeakAndStrongSquares(boardMap, color, attackMap) {
    try {
      const enemyKey = color === "w" ? "black" : "white";
      const weak = [];
      const strong = [];
      allBoardSquares().forEach((square) => {
        const coords = squareCoords(square);
        const inBand =
          color === "w"
            ? coords.rank >= 3 && coords.rank <= 5
            : coords.rank >= 2 && coords.rank <= 4;
        if (!inBand) return;
        const pawnDefended = isPawnDefendedSquare(boardMap, color, square);
        const enemyPawnAttacks = squareAttackers(
          boardMap,
          square,
          color === "w" ? "b" : "w",
        ).filter((attacker) => attacker.type === "p").length;
        const enemyAttackers = getAttackEntry(attackMap, square)[enemyKey];
        const zone =
          coords.file <= 2
            ? "queenside"
            : coords.file >= 5
              ? "kingside"
              : "center";
        if (!pawnDefended && enemyAttackers.length) weak.push({ square, zone });
        if (pawnDefended && !enemyPawnAttacks) strong.push({ square });
      });
      return { weak, strong };
    } catch (_) {
      return { weak: [], strong: [] };
    }
  }

  function detectInvasionSquares(boardMap, color, attackMap) {
    try {
      const result = [];
      const ownKey = color === "w" ? "white" : "black";
      allBoardSquares().forEach((square) => {
        const coords = squareCoords(square);
        if (color === "w" ? coords.rank < 5 : coords.rank > 2) return;
        if (boardMap.has(square)) return;
        const entry = getAttackEntry(attackMap, square);
        const own = entry[ownKey];
        const enemyPawnAttacks = squareAttackers(
          boardMap,
          square,
          color === "w" ? "b" : "w",
        ).filter((attacker) => attacker.type === "p").length;
        if (own.length && !enemyPawnAttacks)
          result.push({ square, zone_rank: coords.rank + 1 });
      });
      return result;
    } catch (_) {
      return [];
    }
  }

  function detectLongDiagonalControl(boardMap, color) {
    try {
      const result = [];
      const diagonals = [
        {
          name: "a1h8",
          squares: ["a1", "b2", "c3", "d4", "e5", "f6", "g7", "h8"],
        },
        {
          name: "a8h1",
          squares: ["a8", "b7", "c6", "d5", "e4", "f3", "g2", "h1"],
        },
      ];
      diagonals.forEach(({ name, squares }) => {
        let controller = "none";
        let pieceSquare = null;
        let whiteFound = null;
        let blackFound = null;
        let blockers = 0;
        squares.forEach((square) => {
          const piece = boardMap.get(square);
          if (!piece) return;
          if (piece.type === "p") blockers += 1;
          if (
            (piece.type === "b" || piece.type === "q") &&
            piece.color === "w" &&
            !whiteFound
          )
            whiteFound = square;
          if (
            (piece.type === "b" || piece.type === "q") &&
            piece.color === "b" &&
            !blackFound
          )
            blackFound = square;
        });
        if (blockers <= 2) {
          if (whiteFound && blackFound) controller = "contested";
          else if (whiteFound) {
            controller = "white";
            pieceSquare = whiteFound;
          } else if (blackFound) {
            controller = "black";
            pieceSquare = blackFound;
          }
        }
        result.push({ diagonal: name, controller, piece_square: pieceSquare });
      });
      return result;
    } catch (_) {
      return [];
    }
  }

  function detectCriticalLineBlockers(boardMap, color) {
    try {
      const enemy = color === "w" ? "b" : "w";
      const results = [];
      pieceList(boardMap, enemy, ["q", "r", "b"]).forEach(
        ({ square: attackerSquare, piece: attackerPiece }) => {
          const directions = [];
          if (attackerPiece.type === "b" || attackerPiece.type === "q")
            directions.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
          if (attackerPiece.type === "r" || attackerPiece.type === "q")
            directions.push([1, 0], [-1, 0], [0, 1], [0, -1]);
          const origin = squareCoords(attackerSquare);
          directions.forEach(([df, dr]) => {
            let file = origin.file + df;
            let rank = origin.rank + dr;
            let blocker = null;
            while (file >= 0 && file < 8 && rank >= 0 && rank < 8) {
              const square = squareFromFileRank(file, rank);
              const piece = boardMap.get(square);
              if (!piece) {
                file += df;
                rank += dr;
                continue;
              }
              if (!blocker) {
                if (piece.color === color) {
                  blocker = { square, piece };
                  file += df;
                  rank += dr;
                  continue;
                }
                break;
              }
              if (
                piece.color === color &&
                ["q", "r", "k"].includes(piece.type)
              ) {
                results.push({
                  blocker_square: blocker.square,
                  blocker_piece: pieceCode(blocker.piece),
                  ray_type:
                    df === 0 || dr === 0
                      ? df === 0
                        ? "file"
                        : "rank"
                      : "diagonal",
                  attacker_square: attackerSquare,
                  target_square: square,
                  target_piece: pieceCode(piece),
                });
              }
              break;
            }
          });
        },
      );
      return results.slice(0, 10);
    } catch (_) {
      return [];
    }
  }

  function detectRuleOfSquare(boardMap, fenSideToMove) {
    try {
      const result = [];
      ["w", "b"].forEach((color) => {
        const enemyKing = findKingSquare(boardMap, color === "w" ? "b" : "w");
        detectPassedPawnFeatures(boardMap, color).forEach((entry) => {
          const promoSquare = `${entry.square[0]}${color === "w" ? "8" : "1"}`;
          let distance = chebyshevDistance(enemyKing, promoSquare);
          if (color !== fenSideToMove) distance -= 1;
          result.push({
            pawn_square: entry.square,
            pawn_color: colorName(color),
            promo_square: promoSquare,
            promo_rank_distance: entry.moves_to_promote,
            enemy_king_square: enemyKing,
            enemy_king_chebyshev_to_promo: Math.max(0, distance),
            king_can_catch: Math.max(0, distance) <= entry.moves_to_promote,
          });
        });
      });
      return result;
    } catch (_) {
      return [];
    }
  }

  function detectOppositeBishops(boardMap) {
    try {
      const whiteBishops = pieceList(boardMap, "w", ["b"]);
      const blackBishops = pieceList(boardMap, "b", ["b"]);
      if (whiteBishops.length !== 1 || blackBishops.length !== 1) {
        return {
          present: false,
          white_bishop_complex: null,
          black_bishop_complex: null,
          tendency: "none",
        };
      }
      const whiteComplex = squareColorComplex(whiteBishops[0].square);
      const blackComplex = squareColorComplex(blackBishops[0].square);
      const queensPresent =
        pieceList(boardMap, "w", ["q"]).length &&
        pieceList(boardMap, "b", ["q"]).length;
      return {
        present: whiteComplex !== blackComplex,
        white_bishop_complex: whiteComplex,
        black_bishop_complex: blackComplex,
        tendency:
          whiteComplex !== blackComplex
            ? queensPresent
              ? "attacking"
              : "drawing"
            : "none",
      };
    } catch (_) {
      return {
        present: false,
        white_bishop_complex: null,
        black_bishop_complex: null,
        tendency: "none",
      };
    }
  }

  function detectInsufficientMaterial(boardMap) {
    try {
      const pieces = Array.from(boardMap.values());
      const nonKings = pieces.filter((piece) => piece.type !== "k");
      // Count bishops and knights per side directly (signature approach had off-by errors for single pieces)
      let wBishops = 0,
        bBishops = 0,
        wKnights = 0,
        bKnights = 0;
      for (const p of nonKings) {
        if (p.type === "b") {
          if (p.color === "w") wBishops++;
          else bBishops++;
        } else if (p.type === "n") {
          if (p.color === "w") wKnights++;
          else bKnights++;
        }
      }
      if (!nonKings.length) return { draw: true, reason: "King versus king" };
      // K+B vs K (any lone bishop) or K vs K+B — both are draws
      if (
        (wBishops === 1 &&
          wKnights === 0 &&
          bBishops === 0 &&
          bKnights === 0) ||
        (bBishops === 1 && bKnights === 0 && wBishops === 0 && wKnights === 0)
      ) {
        return { draw: true, reason: "King and bishop versus king" };
      }
      // K+N vs K (any lone knight) or K vs K+N — both are draws
      if (
        (wKnights === 1 &&
          wBishops === 0 &&
          bBishops === 0 &&
          bKnights === 0) ||
        (bKnights === 1 && bBishops === 0 && wBishops === 0 && wKnights === 0)
      ) {
        return { draw: true, reason: "King and knight versus king" };
      }
      // Both sides have same-colored bishops only (no other non-king pieces) — classic draw
      if (
        wBishops === 1 &&
        bBishops === 1 &&
        wKnights === 0 &&
        bKnights === 0
      ) {
        const bishopSquares = [];
        for (const [sq, p] of boardMap.entries()) {
          if (p.type === "b") bishopSquares.push(squareColorComplex(sq));
        }
        if (
          bishopSquares.length === 2 &&
          bishopSquares[0] === bishopSquares[1]
        ) {
          return { draw: true, reason: "Same-colored bishops only" };
        }
      }
      // K+N+N vs K+N+N is NOT automatically a draw; requires direct check — skip for now
      return { draw: false, reason: null };
    } catch (_) {
      return { draw: false, reason: null };
    }
  }

  function detectFiftyMoveProximity(fenHalfmoveClock) {
    try {
      const halfmove = Number.isFinite(fenHalfmoveClock) ? fenHalfmoveClock : 0;
      return {
        halfmove_clock: halfmove,
        moves_until_claim: Math.max(0, 100 - halfmove),
        urgent: halfmove >= 80,
        auto_draw_at_75: halfmove >= 150,
      };
    } catch (_) {
      return {
        halfmove_clock: 0,
        moves_until_claim: 100,
        urgent: false,
        auto_draw_at_75: false,
      };
    }
  }

  function detectRookEndgamePatterns(boardMap) {
    try {
      const whiteRooks = pieceList(boardMap, "w", ["r"]);
      const blackRooks = pieceList(boardMap, "b", ["r"]);
      const whitePawns = pieceList(boardMap, "w", ["p"]);
      const blackPawns = pieceList(boardMap, "b", ["p"]);
      const whiteKing = findKingSquare(boardMap, "w");
      const blackKing = findKingSquare(boardMap, "b");
      const lucena = { present: false, winning_side: null };
      const philidor = { present: false, defending_side: null };
      const vancura = { present: false };
      const cutOff = { present: false, cut_files: [], cut_ranks: [] };
      const isRookVsRookPlusPawn = (pawnColor) => {
        const pawnOwner = pawnColor === "w" ? whitePawns : blackPawns;
        const pawnOwnerRooks = pawnColor === "w" ? whiteRooks : blackRooks;
        const enemyRooks = pawnColor === "w" ? blackRooks : whiteRooks;
        const enemyKing = pawnColor === "w" ? blackKing : whiteKing;
        return (
          pawnOwner.length === 1 &&
          pawnOwnerRooks.length === 1 &&
          enemyRooks.length === 1 &&
          enemyKing
        );
      };
      const getPawnInfos = (color) => {
        const pawns = color === "w" ? whitePawns : blackPawns;
        return pawns.map(({ square, piece }) => {
          const coords = squareCoords(square);
          return {
            square,
            coords,
            piece,
            movesToPromote: color === "w" ? 7 - coords.rank : coords.rank,
          };
        });
      };
      const allPawns = getPawnInfos("w").concat(getPawnInfos("b"));
      for (const pawnInfo of allPawns) {
        const pawnColor = pawnInfo.piece.color;
        if (!isRookVsRookPlusPawn(pawnColor)) continue;
        const enemyColor = pawnColor === "w" ? "b" : "w";
        const enemyKing = enemyColor === "w" ? whiteKing : blackKing;
        const ownKing = pawnColor === "w" ? whiteKing : blackKing;
        const enemyRooks = enemyColor === "w" ? whiteRooks : blackRooks;
        const pawnCoords = pawnInfo.coords;
        const promotionRank = pawnColor === "w" ? 7 : 0;
        const pawnFile = pawnCoords.file;
        const isLucena =
          pawnInfo.movesToPromote <= 2 &&
          pawnCoords.rank >= (pawnColor === "w" ? 5 : 2);
        if (isLucena) {
          const ownKingCoords = squareCoords(ownKing || "");
          const kingInFrontOfPawn = ownKingCoords
            ? pawnColor === "w"
              ? ownKingCoords.rank === pawnCoords.rank + 1 &&
                ownKingCoords.file === pawnFile
              : ownKingCoords.rank === pawnCoords.rank - 1 &&
                ownKingCoords.file === pawnFile
            : false;
          const enemyKingCoords = squareCoords(enemyKing || "");
          const ownRooks = pawnColor === "w" ? whiteRooks : blackRooks;
          const ownRookCoords = squareCoords(ownRooks[0]?.square || "");
          let kingCutOff = false;
          if (
            enemyKingCoords &&
            ownRookCoords &&
            ownRookCoords.file === pawnFile
          ) {
            const pawnRank = pawnCoords.rank;
            const defenderRank = enemyKingCoords.rank;
            const attackerRookRank = ownRookCoords.rank;
            if (pawnColor === "w") {
              kingCutOff =
                defenderRank < pawnRank && attackerRookRank > pawnRank;
            } else {
              kingCutOff =
                defenderRank > pawnRank && attackerRookRank < pawnRank;
            }
          }
          if (kingInFrontOfPawn && kingCutOff) {
            lucena.present = true;
            lucena.winning_side = colorName(pawnColor);
          }
        }
        const isPhilidor =
          pawnInfo.movesToPromote >= 3 &&
          pawnCoords.rank !== (pawnColor === "w" ? 5 : 2);
        if (isPhilidor) {
          const defendingRook = enemyRooks[0];
          const defendingRookCoords = squareCoords(defendingRook?.square || "");
          const enemyKingCoords = squareCoords(enemyKing || "");
          const defenseRank = pawnColor === "w" ? 2 : 5;
          const promoRank = pawnColor === "w" ? 7 : 0;
          const kingOnPromoRank =
            enemyKingCoords &&
            enemyKingCoords.rank === promoRank &&
            enemyKingCoords.file === pawnFile;
          const rookOnDefenseRank =
            defendingRookCoords &&
            defendingRookCoords.rank === defenseRank &&
            defendingRookCoords.file === pawnFile;
          if (rookOnDefenseRank && kingOnPromoRank) {
            philidor.present = true;
            philidor.defending_side = colorName(enemyColor);
          }
        }
        if (/^[ah]/.test(pawnInfo.square) && enemyRooks.length === 1) {
          const enemyRookCoords = squareCoords(enemyRooks[0].square || "");
          const enemyKingCoords = squareCoords(enemyKing || "");
          const pawnRank = pawnCoords.rank;
          const lateralSetup =
            enemyRookCoords && enemyKingCoords
              ? enemyRookCoords.rank === enemyKingCoords.rank &&
                enemyRookCoords.file !== pawnFile &&
                Math.abs(enemyRookCoords.file - pawnFile) >= 2
              : false;
          if (lateralSetup) {
            vancura.present = true;
          }
        }
      }
      const cutFiles = new Set();
      const cutRanks = new Set();
      const processCutoffByColor = (rookColor) => {
        const rooks = rookColor === "w" ? whiteRooks : blackRooks;
        const enemyColor = rookColor === "w" ? "b" : "w";
        const enemyKing = enemyColor === "w" ? whiteKing : blackKing;
        const enemyKingCoords = squareCoords(enemyKing || "");
        for (const { square: rookSquare } of rooks) {
          const rookCoords = squareCoords(rookSquare);
          if (!rookCoords || !enemyKingCoords) continue;
          const sameFile = rookCoords.file === enemyKingCoords.file;
          const sameRank = rookCoords.rank === enemyKingCoords.rank;
          if (sameFile || sameRank) {
            const isBarrier = sameFile
              ? rookCoords.rank > enemyKingCoords.rank &&
                Array.from(
                  { length: rookCoords.rank - enemyKingCoords.rank - 1 },
                  (_, i) =>
                    boardMap.get(
                      squareFromFileRank(
                        rookCoords.file,
                        enemyKingCoords.rank + 1 + i,
                      ),
                    ),
                ).every((p) => !p || p.color === enemyColor)
              : Math.abs(rookCoords.file - enemyKingCoords.file) > 1 &&
                Array.from(
                  {
                    length:
                      Math.abs(rookCoords.file - enemyKingCoords.file) - 1,
                  },
                  (_, i) => {
                    const f =
                      Math.min(rookCoords.file, enemyKingCoords.file) + 1 + i;
                    return boardMap.get(
                      squareFromFileRank(f, enemyKingCoords.rank),
                    );
                  },
                ).every((p) => !p || p.color === enemyColor);
            if (isBarrier) {
              if (sameFile) cutRanks.add(`${enemyKingCoords.rank + 1}`);
              else cutFiles.add(fileLetter(enemyKingCoords.file));
            }
          }
        }
      };
      if (whiteRooks.length || blackRooks.length) {
        processCutoffByColor("w");
        processCutoffByColor("b");
      }
      if (cutFiles.size || cutRanks.size) {
        cutOff.present = true;
        cutOff.cut_files = Array.from(cutFiles);
        cutOff.cut_ranks = Array.from(cutRanks);
      }
      return { lucena, philidor, vancura, cut_off_king: cutOff };
    } catch (_) {
      return {
        lucena: { present: false, winning_side: null },
        philidor: { present: false, defending_side: null },
        vancura: { present: false },
        cut_off_king: { present: false, cut_files: [], cut_ranks: [] },
      };
    }
  }

  function detectKingActivityScore(boardMap, color, phase) {
    try {
      const kingSquare = findKingSquare(boardMap, color);
      const centerTargets = ["d4", "e4", "d5", "e5"];
      const centralDistance = Math.min(
        ...centerTargets.map((square) => chebyshevDistance(kingSquare, square)),
      );
      const pawns = pieceList(boardMap, "w", ["p"]).concat(
        pieceList(boardMap, "b", ["p"]),
      );
      const nearestPawnDistance = pawns.length
        ? Math.min(
            ...pawns.map(({ square }) => chebyshevDistance(kingSquare, square)),
          )
        : 8;
      const score =
        phase === "endgame" ||
        phase === "queenless_endgame" ||
        phase === "rook_endgame"
          ? Math.max(0, 7 - centralDistance)
          : Math.max(0, 4 - centralDistance);
      return {
        score,
        central_distance: centralDistance,
        distance_to_nearest_pawn: nearestPawnDistance,
      };
    } catch (_) {
      return { score: 0, central_distance: 0, distance_to_nearest_pawn: 0 };
    }
  }

  function detectMaterialImbalances(boardMap) {
    try {
      const phase = detectGamePhase(boardMap);
      const bishopPair = detectBishopPair(boardMap);
      const wrongBishop = {
        white: detectWrongBishop(boardMap, "w").present,
        black: detectWrongBishop(boardMap, "b").present,
      };
      const totalPawns =
        pieceList(boardMap, "w", ["p"]).length +
        pieceList(boardMap, "b", ["p"]).length;
      return {
        knight_vs_bishop: {
          advantage:
            phase === "endgame" && totalPawns >= 8
              ? "knight"
              : phase === "opening" || phase === "middlegame"
                ? "bishop"
                : "equal",
          reason:
            phase === "endgame" && totalPawns >= 8
              ? "closed pawn structure favors knights"
              : "open lines favor bishops",
        },
        bishop_pair_advantage: bishopPair.white
          ? "white"
          : bishopPair.black
            ? "black"
            : "none",
        rook_vs_two_minors: {
          advantage:
            phase === "opening" || phase === "middlegame" ? "minors" : "equal",
        },
        wrong_bishop: wrongBishop,
      };
    } catch (_) {
      return {
        knight_vs_bishop: { advantage: "equal", reason: "" },
        bishop_pair_advantage: "none",
        rook_vs_two_minors: { advantage: "equal" },
        wrong_bishop: { white: false, black: false },
      };
    }
  }

  function classifyMatePattern(boardMap, matedKingSquare, matedColor) {
    try {
      const kingPiece = boardMap.get(matedKingSquare);
      if (!kingPiece) return null;
      const enemy = matedColor === "w" ? "b" : "w";
      const attackers = squareAttackers(boardMap, matedKingSquare, enemy);
      const attackerSquares = attackers.map((entry) => entry.square);
      const attackerPieces = attackerSquares
        .map((square) => boardMap.get(square))
        .filter(Boolean);
      const knightAttackers = attackerPieces.filter(
        (piece) => piece.type === "n",
      );
      const rookAttackers = attackerPieces.filter(
        (piece) => piece.type === "r",
      );
      const queenAttackers = attackerPieces.filter(
        (piece) => piece.type === "q",
      );
      const bishopAttackers = attackerPieces.filter(
        (piece) => piece.type === "b",
      );
      if (knightAttackers.length >= 1) {
        const adjacent = attackSquaresForPiece(
          boardMap,
          matedKingSquare,
          kingPiece,
        );
        const allBlocked = adjacent.every((sq) => {
          const p = boardMap.get(sq);
          return p && p.color === matedColor;
        });
        if (allBlocked) return "smothered_mate";
        if (rookAttackers.length >= 1) return "arabian_mate";
        if (queenAttackers.length >= 1) return "anastasia_mate";
        return "suffocation_mate";
      }
      const pawnAttackers = attackerPieces.filter(
        (piece) => piece.type === "p",
      );
      if (pawnAttackers.length >= 1) return "pawn_mate";
      if (rookAttackers.length >= 2) return "blind_swine_mate";
      if (queenAttackers.length >= 1) {
        const queenSquare = attackerSquares.find(
          (sq) => boardMap.get(sq)?.type === "q",
        );
        const queenCoords = squareCoords(queenSquare);
        const kingCoords = squareCoords(matedKingSquare);
        if (queenCoords && kingCoords) {
          if (
            queenCoords.file === kingCoords.file ||
            queenCoords.rank === kingCoords.rank
          )
            return "corridor_mate";
          if (
            Math.abs(queenCoords.file - kingCoords.file) ===
            Math.abs(queenCoords.rank - kingCoords.rank)
          )
            return "dovetail_mate";
        }
        const coords = squareCoords(matedKingSquare);
        if (coords && (coords.rank === 0 || coords.rank === 7))
          return "back_rank_mate";
        if (bishopAttackers.length >= 1) return "opera_mate";
        if (rookAttackers.length >= 1) return "morphy's_mate";
        return "dovetail_mate";
      }
      if (rookAttackers.length >= 1) {
        const coords = squareCoords(matedKingSquare);
        const rookSquare = attackerSquares.find(
          (sq) => boardMap.get(sq)?.type === "r",
        );
        const rookCoords = squareCoords(rookSquare);
        if (rookCoords && coords) {
          if (
            rookCoords.file === coords.file ||
            rookCoords.rank === coords.rank
          ) {
            const sameFileRooks =
              rookAttackers.length >= 2 ? "ladder_mate" : "corridor_mate";
            return sameFileRooks;
          }
        }
        return "corridor_mate";
      }
      if (bishopAttackers.length >= 2) return "boden's_mate";
      const kingCoords2 = squareCoords(matedKingSquare);
      if (kingCoords2 && rookAttackers.length >= 1) {
        const rookSquare2 = attackerSquares.find(
          (sq) => boardMap.get(sq)?.type === "r",
        );
        const rookCoords2 = squareCoords(rookSquare2);
        if (rookCoords2) {
          const epauletteH =
            rookCoords2.rank === kingCoords2.rank &&
            rookAttackers.length >= 2 &&
            attackerSquares.filter(
              (sq) =>
                boardMap.get(sq)?.type === "r" &&
                squareCoords(sq)?.rank === kingCoords2.rank,
            ).length >= 2;
          const epauletteV =
            rookCoords2.file === kingCoords2.file &&
            rookAttackers.length >= 2 &&
            attackerSquares.filter(
              (sq) =>
                boardMap.get(sq)?.type === "r" &&
                squareCoords(sq)?.file === kingCoords2.file,
            ).length >= 2;
          if (epauletteH || epauletteV) return "epaulette_mate";
        }
      }
      return "checkmate";
    } catch (_) {
      return null;
    }
  }

  function detectMatingPatterns(boardMap, game) {
    try {
      const result = [];
      if (game?.in_checkmate?.()) {
        const matedColor = game.turn();
        const kingSquare = findKingSquare(boardMap, matedColor);
        const pattern =
          classifyMatePattern(boardMap, kingSquare, matedColor) || "checkmate";
        result.push({
          pattern,
          evidence:
            pattern === "checkmate"
              ? "No specific named pattern matched"
              : `Detected ${pattern.replace(/_/g, " ")} around ${kingSquare}.`,
        });
        return result;
      }
      const checkingMoves =
        game
          ?.moves?.({ verbose: true })
          .filter((move) => /[+#]/.test(move.san))
          .slice(0, 3) || [];
      checkingMoves.forEach((move) => {
        result.push({
          pattern: move.promotion
            ? "promotion_mate_threat"
            : "checking_pattern",
          evidence: `${move.san} gives immediate check.`,
        });
      });
      return result.slice(0, 4);
    } catch (_) {
      return [];
    }
  }

  function detectForcingMovesProfile(legalMoves, boardMap, game) {
    try {
      const checks = (legalMoves || []).filter((move) =>
        /[+#]/.test(move.san),
      ).length;
      const captures = (legalMoves || []).filter(
        (move) =>
          String(move.flags || "").includes("c") ||
          String(move.flags || "").includes("e"),
      ).length;
      const baseFen = game?.fen?.() || "";
      const probe = baseFen ? new Chess(baseFen) : null;
      let threats = 0;
      (legalMoves || []).slice(0, 5).forEach((move) => {
        if (!probe) return;
        const moverColor = boardMap.get(move.from)?.color;
        if (!moverColor) return;
        const enemyColor = moverColor === "w" ? "b" : "w";
        probe.load(baseFen);
        const played = probe.move({
          from: move.from,
          to: move.to,
          promotion: move.promotion || undefined,
        });
        if (!played) return;
        const nextBoard = buildBoardMap(probe);
        const hangingSquares = [];
        for (const [sq, pc] of nextBoard.entries()) {
          if (pc.type === "k") continue;
          if (pc.color !== enemyColor) continue;
          const attackers = squareAttackers(nextBoard, sq, moverColor);
          const defenders = squareAttackers(nextBoard, sq, enemyColor);
          if (attackers.length && !defenders.length) hangingSquares.push(sq);
        }
        if (hangingSquares.length) threats += 1;
      });
      const totalForcing = checks + captures + threats;
      let complexityTag = "technical";
      if (checks > 2 || captures > 6) complexityTag = "sharp";
      else if (checks + captures > 4) complexityTag = "tactical";
      else if (checks + captures <= 2) complexityTag = "quiet";
      return {
        checks,
        captures,
        threats,
        total_forcing: totalForcing,
        complexity_tag: complexityTag,
      };
    } catch (_) {
      return {
        checks: 0,
        captures: 0,
        threats: 0,
        total_forcing: 0,
        complexity_tag: "quiet",
      };
    }
  }

  function detectInitiative(
    boardMap,
    color,
    attackMap,
    phase,
    forcingProfile = null,
    enemyForcingProfile = null,
    development = null,
    enemyDevelopment = null,
  ) {
    try {
      const ownForcing = forcingProfile?.total_forcing || 0;
      const enemyForcing = enemyForcingProfile?.total_forcing || 0;
      const ownZone = detectKingZoneAttacks(
        boardMap,
        color === "w" ? "b" : "w",
        attackMap,
      ).attack_units;
      const enemyZone = detectKingZoneAttacks(
        boardMap,
        color,
        attackMap,
      ).attack_units;
      const devDiff =
        (development?.development_score || 0) -
        (enemyDevelopment?.development_score || 0);
      const score = ownForcing - enemyForcing + ownZone - enemyZone + devDiff;
      const reasons = [];
      if (ownForcing > enemyForcing) reasons.push("more_checks_available");
      if (ownZone > enemyZone) reasons.push("king_under_attack");
      if (devDiff > 0) reasons.push("development_lead");
      if (phase === "endgame" && score > 0) reasons.push("active_king");
      return {
        has_initiative: score > 2,
        score,
        reasons,
      };
    } catch (_) {
      return { has_initiative: false, score: 0, reasons: [] };
    }
  }

  function detectPawnBreaks(boardMap, color, legalMoves, baseFen) {
    try {
      const result = [];
      if (!baseFen) return result;
      const probe = new Chess(baseFen);
      (legalMoves || [])
        .filter(
          (move) =>
            (boardMap.get(move.from)?.color || "") === color &&
            boardMap.get(move.from)?.type === "p",
        )
        .forEach((move) => {
          let effect = "";
          if (
            String(move.flags || "").includes("c") ||
            String(move.flags || "").includes("e")
          )
            effect = "opens_file";
          const fromCoords = squareCoords(move.from);
          const toCoords = squareCoords(move.to);
          if (
            !effect &&
            ["d", "e"].includes(move.from[0]) &&
            Math.abs(fromCoords.rank - toCoords.rank) === 1
          )
            effect = "opens_center";
          probe.load(baseFen);
          const played = probe.move({
            from: move.from,
            to: move.to,
            promotion: move.promotion || undefined,
          });
          if (!played) return;
          const afterBoard = buildBoardMap(probe);
          if (!effect && isPassedPawn(afterBoard, move.to, color))
            effect = "creates_passer";
          if (!effect) {
            const enemyChainTarget = attackSquaresForPiece(
              afterBoard,
              move.to,
              { type: "p", color },
            ).find((targetSquare) => {
              const target = afterBoard.get(targetSquare);
              if (!target || target.color === color || target.type !== "p")
                return false;
              const entry = squareAttackers(
                afterBoard,
                targetSquare,
                target.color,
              ).filter((attacker) => attacker.type === "p");
              return entry.length === 1;
            });
            if (enemyChainTarget) effect = "attacks_chain_base";
          }
          if (effect) {
            result.push({
              move_san: move.san,
              move_uci: move.from + move.to + (move.promotion || ""),
              effect,
            });
          }
        });
      const priority = {
        creates_passer: 0,
        opens_center: 1,
        opens_file: 2,
        attacks_chain_base: 3,
      };
      return result
        .sort((a, b) => (priority[a.effect] || 9) - (priority[b.effect] || 9))
        .slice(0, 6);
    } catch (_) {
      return [];
    }
  }

  function buildFeatureSummary(features) {
    try {
      const summary = [];
      const counts = new Map();
      const hangingWhite =
        features?.tactical_features?.hanging_pieces?.white || [];
      const hangingBlack =
        features?.tactical_features?.hanging_pieces?.black || [];
      const forks = features?.tactical_features?.forks || [];
      const skewersWhite = features?.tactical_features?.skewers?.white || [];
      const skewersBlack = features?.tactical_features?.skewers?.black || [];
      const xRaysWhite =
        features?.tactical_features?.x_ray_attacks?.white || [];
      const xRaysBlack =
        features?.tactical_features?.x_ray_attacks?.black || [];
      const pinsWhite = features?.tactical_features?.pins?.white || [];
      const pinsBlack = features?.tactical_features?.pins?.black || [];
      const matingPatterns = features?.tactical_features?.mating_patterns || [];
      const backRankWhite = features?.king_safety?.white?.back_rank_weakness;
      const backRankBlack = features?.king_safety?.black?.back_rank_weakness;
      const openDiagWhite = features?.king_safety?.white?.open_diagonals || [];
      const openDiagBlack = features?.king_safety?.black?.open_diagonals || [];
      const weakWhite = features?.pawn_structure?.white?.backward_pawns || [];
      const weakBlack = features?.pawn_structure?.black?.backward_pawns || [];
      const outpostsWhite =
        features?.piece_activity?.white?.available_outposts || [];
      const outpostsBlack =
        features?.piece_activity?.black?.available_outposts || [];
      const badBishopsWhite = (
        features?.piece_activity?.white?.bad_bishops || []
      ).filter((entry) => entry.is_bad);
      const badBishopsBlack = (
        features?.piece_activity?.black?.bad_bishops || []
      ).filter((entry) => entry.is_bad);
      const center = features?.space_and_control?.center;
      const initiative = features?.dynamics?.initiative;
      const developmentWhite = features?.piece_activity?.white?.development;
      const developmentBlack = features?.piece_activity?.black?.development;
      const ruleOfSquare = features?.endgame?.rule_of_square || [];
      const wrongBishop = features?.piece_activity?.material_imbalances
        ?.wrong_bishop || { white: false, black: false };
      const rookPatterns = features?.endgame?.rook_endgame_patterns || {};

      if (hangingWhite.length)
        addSummarySentence(
          summary,
          counts,
          "tactics",
          `White has hanging material on ${hangingWhite.map((entry) => entry.square).join(", ")}.`,
          ["hanging_piece"],
        );
      if (hangingBlack.length)
        addSummarySentence(
          summary,
          counts,
          "tactics",
          `Black has hanging material on ${hangingBlack.map((entry) => entry.square).join(", ")}.`,
          ["hanging_piece"],
        );
      if (forks.length)
        addSummarySentence(
          summary,
          counts,
          "tactics",
          `${forks[0].color === "white" ? "White" : "Black"} has a fork available with ${forks[0].move_san}.`,
          ["fork"],
        );
      if (skewersWhite.length)
        addSummarySentence(
          summary,
          counts,
          "tactics",
          `Black has a skewer against White starting from ${skewersWhite[0].attacker_square}.`,
          ["skewer"],
        );
      if (skewersBlack.length)
        addSummarySentence(
          summary,
          counts,
          "tactics",
          `White has a skewer against Black starting from ${skewersBlack[0].attacker_square}.`,
          ["skewer"],
        );
      if (pinsWhite.length)
        addSummarySentence(
          summary,
          counts,
          "tactics",
          `White has a pinned piece on ${pinsWhite[0].square}.`,
          ["pin"],
        );
      if (pinsBlack.length)
        addSummarySentence(
          summary,
          counts,
          "tactics",
          `Black has a pinned piece on ${pinsBlack[0].square}.`,
          ["pin"],
        );
      if (xRaysWhite.length)
        addSummarySentence(
          summary,
          counts,
          "tactics",
          `White has an x-ray line toward ${xRaysWhite[0].target_square}.`,
          ["x_ray"],
        );
      if (xRaysBlack.length)
        addSummarySentence(
          summary,
          counts,
          "tactics",
          `Black has an x-ray line toward ${xRaysBlack[0].target_square}.`,
          ["x_ray"],
        );
      if (matingPatterns.length)
        addSummarySentence(
          summary,
          counts,
          "tactics",
          `Immediate mating theme detected: ${matingPatterns[0].pattern.replace(/_/g, " ")}.`,
          ["mating_pattern"],
        );
      if (backRankWhite?.score >= 2)
        addSummarySentence(
          summary,
          counts,
          "king",
          `White has a serious back-rank weakness.`,
          ["back_rank"],
        );
      if (backRankBlack?.score >= 2)
        addSummarySentence(
          summary,
          counts,
          "king",
          `Black has a serious back-rank weakness.`,
          ["back_rank"],
        );
      if (openDiagWhite.length)
        addSummarySentence(
          summary,
          counts,
          "king",
          `White's king is exposed on diagonal lines toward ${openDiagWhite[0].attacking_piece_square}.`,
          ["open_diagonal"],
        );
      if (openDiagBlack.length)
        addSummarySentence(
          summary,
          counts,
          "king",
          `Black's king is exposed on diagonal lines toward ${openDiagBlack[0].attacking_piece_square}.`,
          ["open_diagonal"],
        );
      if (weakWhite.length)
        addSummarySentence(
          summary,
          counts,
          "structure",
          `White has backward pawn targets on ${weakWhite.map((entry) => entry.square).join(", ")}.`,
          ["backward_pawn"],
        );
      if (weakBlack.length)
        addSummarySentence(
          summary,
          counts,
          "structure",
          `Black has backward pawn targets on ${weakBlack.map((entry) => entry.square).join(", ")}.`,
          ["backward_pawn"],
        );
      if (outpostsWhite.length)
        addSummarySentence(
          summary,
          counts,
          "structure",
          `White has an outpost available on ${outpostsWhite[0]}.`,
          ["outpost_available"],
        );
      if (outpostsBlack.length)
        addSummarySentence(
          summary,
          counts,
          "structure",
          `Black has an outpost available on ${outpostsBlack[0]}.`,
          ["outpost_available"],
        );
      if (badBishopsWhite.length)
        addSummarySentence(
          summary,
          counts,
          "structure",
          `White has a bad bishop on ${badBishopsWhite[0].square}.`,
          ["bad_bishop"],
        );
      if (badBishopsBlack.length)
        addSummarySentence(
          summary,
          counts,
          "structure",
          `Black has a bad bishop on ${badBishopsBlack[0].square}.`,
          ["bad_bishop"],
        );
      if (center && center.white_total !== center.black_total)
        addSummarySentence(
          summary,
          counts,
          "strategy",
          `${center.white_total > center.black_total ? "White" : "Black"} controls more of the center.`,
          ["center_control"],
        );
      if (initiative?.has_initiative)
        addSummarySentence(
          summary,
          counts,
          "strategy",
          `${features.side_to_move} has the initiative through ${initiative.reasons.join(", ") || "more forcing play"}.`,
          ["initiative"],
        );
      if (
        (developmentWhite?.development_score || 0) !==
        (developmentBlack?.development_score || 0)
      ) {
        addSummarySentence(
          summary,
          counts,
          "strategy",
          `${(developmentWhite?.development_score || 0) > (developmentBlack?.development_score || 0) ? "White" : "Black"} is ahead in development.`,
          ["development_lead"],
        );
      }
      if (ruleOfSquare.some((entry) => !entry.king_can_catch))
        addSummarySentence(
          summary,
          counts,
          "endgame",
          `A passed pawn outruns the enemy king by the rule of the square.`,
          ["rule_of_square"],
        );
      if (wrongBishop.white || wrongBishop.black)
        addSummarySentence(
          summary,
          counts,
          "endgame",
          `${wrongBishop.white ? "White" : "Black"} has a wrong-bishop ending motif.`,
          ["wrong_bishop"],
        );
      if (
        rookPatterns.lucena?.present ||
        rookPatterns.philidor?.present ||
        rookPatterns.vancura?.present
      ) {
        addSummarySentence(
          summary,
          counts,
          "endgame",
          `Known rook endgame technique is present (${rookPatterns.lucena?.present ? "Lucena" : rookPatterns.philidor?.present ? "Philidor" : "Vancura"}).`,
          ["rook_endgame_pattern"],
        );
      }
      return summary.slice(0, 14);
    } catch (_) {
      return [];
    }
  }

  function emptyPositionFeatures(fen, overrides = {}) {
    return {
      ok: false,
      fen,
      side_to_move: "white",
      status: {
        in_check: false,
        checkmate: false,
        stalemate: false,
        draw: false,
        legal_moves: 0,
      },
      phase: "unknown",
      material_class: "unknown",
      castling: {
        white_kingside: false,
        white_queenside: false,
        black_kingside: false,
        black_queenside: false,
      },
      attack_map_summary: {
        white_controlled: 0,
        black_controlled: 0,
        contested: 0,
      },
      material: { white: 0, black: 0, imbalance: 0 },
      mobility: { white: 0, black: 0 },
      pawn_structure: {
        white: {
          open_files: [],
          backward_pawns: [],
          hanging_pair: null,
          candidate_passers: [],
          tripled_files: [],
          passed_features: [],
          pawn_breaks: [],
          tension_pairs: [],
          majority: { queenside: 0, kingside: 0 },
          duos: [],
          wrong_bishop: { present: false },
        },
        black: {
          open_files: [],
          backward_pawns: [],
          hanging_pair: null,
          candidate_passers: [],
          tripled_files: [],
          passed_features: [],
          pawn_breaks: [],
          tension_pairs: [],
          majority: { queenside: 0, kingside: 0 },
          duos: [],
          wrong_bishop: { present: false },
        },
        structural_archetype: null,
        color_complex: { white: null, black: null },
      },
      files: { open: [], half_open_white: [], half_open_black: [] },
      piece_activity: {
        white: {
          development: null,
          knight_outposts: [],
          available_outposts: [],
          bad_bishops: [],
          bishop_pair: false,
          rooks: [],
          connected_rooks: [],
          batteries: [],
          trapped_pieces: [],
          desperado_moves: [],
          queen_exposure: null,
          best_piece: null,
          worst_piece: null,
        },
        black: {
          development: null,
          knight_outposts: [],
          available_outposts: [],
          bad_bishops: [],
          bishop_pair: false,
          rooks: [],
          connected_rooks: [],
          batteries: [],
          trapped_pieces: [],
          desperado_moves: [],
          queen_exposure: null,
          best_piece: null,
          worst_piece: null,
        },
        material_imbalances: {
          knight_vs_bishop: { advantage: "equal", reason: "" },
          bishop_pair_advantage: "none",
          rook_vs_two_minors: { advantage: "equal" },
          wrong_bishop: { white: false, black: false },
        },
      },
      king_safety: {
        white: {
          safety_score: 0,
          shelter_score: 0,
          tropism: null,
          escape_squares: {
            safe_squares: [],
            count: 0,
            luft_possible: false,
          },
          back_rank_weakness: {
            weak: false,
            score: 0,
            escape_squares: 0,
            luft_possible: false,
            enemy_heavy_access: false,
          },
          open_diagonals: [],
          zone_attacks: { attack_units: 0, squares: [] },
          king_activity: {
            score: 0,
            central_distance: 0,
            distance_to_nearest_pawn: 0,
          },
        },
        black: {
          safety_score: 0,
          shelter_score: 0,
          tropism: null,
          escape_squares: {
            safe_squares: [],
            count: 0,
            luft_possible: false,
          },
          back_rank_weakness: {
            weak: false,
            score: 0,
            escape_squares: 0,
            luft_possible: false,
            enemy_heavy_access: false,
          },
          open_diagonals: [],
          zone_attacks: { attack_units: 0, squares: [] },
          king_activity: {
            score: 0,
            central_distance: 0,
            distance_to_nearest_pawn: 0,
          },
        },
        opposition: null,
      },
      space_and_control: {
        center: null,
        white_space: 0,
        black_space: 0,
        weak_squares: { white: [], black: [] },
        strong_squares: { white: [], black: [] },
        invasion_squares: { white: [], black: [] },
        long_diagonals: [],
        critical_line_blockers: { white: [], black: [] },
      },
      tactical_features: {
        pins: { white: [], black: [] },
        checking_moves: [],
        capture_threats: [],
        opponent_checking_moves: [],
        opponent_capture_threats: [],
        forks: [],
        check_threats: [],
        skewers: { white: [], black: [] },
        promotion_threats: { white: null, black: null },
        hanging_pieces: { white: [], black: [] },
        underdefended_pieces: { white: [], black: [] },
        overloaded_pieces: { white: [], black: [] },
        relative_pins: { white: [], black: [] },
        discovered_attacks: { white: [], black: [] },
        discovered_checks: { white: [], black: [] },
        double_checks: { white: [], black: [] },
        x_ray_attacks: { white: [], black: [] },
        cross_checks: [],
        trapped_pieces: { white: [], black: [] },
        desperado_moves: { white: [], black: [] },
        mating_patterns: [],
      },
      endgame: {
        rule_of_square: [],
        opposite_bishops: {
          present: false,
          white_bishop_complex: null,
          black_bishop_complex: null,
          tendency: "none",
        },
        insufficient_material: { draw: false, reason: null },
        fifty_move: { proximity: 0, is_fifty_move: false },
        rook_endgame_patterns: {
          lucena: { present: false, winning_side: null },
          philidor: { present: false, defending_side: null },
          vancura: { present: false },
          cut_off_king: { present: false, cut_files: [], cut_ranks: [] },
        },
        king_activity: {
          white: {
            score: 0,
            central_distance: 0,
            distance_to_nearest_pawn: 0,
          },
          black: {
            score: 0,
            central_distance: 0,
            distance_to_nearest_pawn: 0,
          },
        },
      },
      dynamics: {
        forcing_profile: {
          checks: 0,
          captures: 0,
          threats: 0,
          total_forcing: 0,
          complexity_tag: "quiet",
        },
        initiative: { has_initiative: false, score: 0, reasons: [] },
      },
      king_opposition: null,
      summary: [],
      ...overrides,
    };
  }

  function castlingRightsFromFen(fen) {
    const parts = String(fen || "").trim().split(/\s+/);
    const castlingField = parts[2] || "-";
    return {
      white_kingside: castlingField.includes("K"),
      white_queenside: castlingField.includes("Q"),
      black_kingside: castlingField.includes("k"),
      black_queenside: castlingField.includes("q"),
    };
  }

  function analyzeLegalMovesForColor(fen, color) {
    try {
      const parts = normalizeToolFen(fen).split(" ");
      parts[1] = color;
      parts[3] = "-";
      const game = new Chess(parts.join(" "));
      return {
        fen: game.fen(),
        game,
        moves: game.moves({ verbose: true }),
      };
    } catch (_) {
      return {
        fen: normalizeToolFen(fen),
        game: null,
        moves: [],
      };
    }
  }

  function buildAttackMapSummary(attackMap) {
    try {
      let whiteControlled = 0;
      let blackControlled = 0;
      let contested = 0;
      allBoardSquares().forEach((square) => {
        const entry = getAttackEntry(attackMap, square);
        const white = (entry.white || []).length > 0;
        const black = (entry.black || []).length > 0;
        if (white) whiteControlled += 1;
        if (black) blackControlled += 1;
        if (white && black) contested += 1;
      });
      return {
        white_controlled: whiteControlled,
        black_controlled: blackControlled,
        contested,
      };
    } catch (_) {
      return {
        white_controlled: 0,
        black_controlled: 0,
        contested: 0,
      };
    }
  }

  function computePositionFeatures(fen) {
    const normalizedFen = normalizeToolFen(fen);
    if (_positionFeaturesCache.has(normalizedFen))
      return _positionFeaturesCache.get(normalizedFen);
    try {
      const game = new Chess(normalizedFen);
      const boardMap = buildBoardMap(game);
      const legalMoves = game.moves({ verbose: true });
      const sideToMove = game.turn();
      const enemyColor = sideToMove === "w" ? "b" : "w";
      const material = collectMaterial(boardMap);
      const phase = detectGamePhase(boardMap);
      const materialClass = detectMaterialClass(boardMap);
      const attackMap = buildAttackMap(boardMap);
      const whitePosition = analyzeLegalMovesForColor(normalizedFen, "w");
      const blackPosition = analyzeLegalMovesForColor(normalizedFen, "b");
      const whiteLegalMoves = whitePosition.moves;
      const blackLegalMoves = blackPosition.moves;
      const fileProfile = openFileProfile(boardMap);
      const fenParts = normalizedFen.split(" ");
      const castlingField = fenParts[2] || "-";
      const halfmoveClock = fenParts[4] || "0";
      const centerControl = detectCenterControl(attackMap, boardMap);
      const whiteDevelopment = detectDevelopmentStatus(
        boardMap,
        "w",
        castlingField,
      );
      const blackDevelopment = detectDevelopmentStatus(
        boardMap,
        "b",
        castlingField,
      );
      const whiteOutposts = detectKnightOutposts(boardMap, "w");
      const blackOutposts = detectKnightOutposts(boardMap, "b");
      const bishopPair = detectBishopPair(boardMap);
      const pawnMajority = detectPawnMajority(boardMap);
      const weakStrongSquares = {
        white: detectWeakAndStrongSquares(boardMap, "w", attackMap),
        black: detectWeakAndStrongSquares(boardMap, "b", attackMap),
      };
      const whiteKingTropism = detectKingTropism(boardMap, "w");
      const blackKingTropism = detectKingTropism(boardMap, "b");
      const whiteEscapeSquares = detectEscapeSquares(
        boardMap,
        "w",
        attackMap,
        whitePosition.game,
      );
      const blackEscapeSquares = detectEscapeSquares(
        boardMap,
        "b",
        attackMap,
        blackPosition.game,
      );
      const whiteBackRank = detectBackRankWeakness(
        boardMap,
        "w",
        attackMap,
        whitePosition.game,
      );
      const blackBackRank = detectBackRankWeakness(
        boardMap,
        "b",
        attackMap,
        blackPosition.game,
      );
      const whiteHanging = detectHangingPieces(boardMap, attackMap).filter(
        (entry) => (boardMap.get(entry.square)?.color || "") === "w",
      );
      const blackHanging = detectHangingPieces(boardMap, attackMap).filter(
        (entry) => (boardMap.get(entry.square)?.color || "") === "b",
      );
      const whiteUnderdefended = detectUnderdefendedPieces(
        boardMap,
        attackMap,
        whiteHanging,
      ).filter((entry) => (boardMap.get(entry.square)?.color || "") === "w");
      const blackUnderdefended = detectUnderdefendedPieces(
        boardMap,
        attackMap,
        blackHanging,
      ).filter((entry) => (boardMap.get(entry.square)?.color || "") === "b");
      const overloadedPieces = detectOverloadedPieces(boardMap, attackMap);
      const whiteDiscovered = detectDiscoveredAttacks(
        boardMap,
        "w",
        whiteLegalMoves,
        whitePosition.fen,
      );
      const blackDiscovered = detectDiscoveredAttacks(
        boardMap,
        "b",
        blackLegalMoves,
        blackPosition.fen,
      );
      const whiteDesperado = detectDesperadoMoves(
        boardMap,
        "w",
        whiteLegalMoves,
        attackMap,
      );
      const blackDesperado = detectDesperadoMoves(
        boardMap,
        "b",
        blackLegalMoves,
        attackMap,
      );
      const forcingProfile = detectForcingMovesProfile(legalMoves, boardMap, game);
      const enemyForcingProfile = detectForcingMovesProfile(
        enemyColor === "w" ? whiteLegalMoves : blackLegalMoves,
        boardMap,
        enemyColor === "w" ? whitePosition.game : blackPosition.game,
      );
      const features = emptyPositionFeatures(normalizedFen, {
        ok: true,
        side_to_move: colorName(sideToMove),
        status: {
          in_check: game.in_check?.() || false,
          checkmate: game.in_checkmate?.() || false,
          stalemate: game.in_stalemate?.() || false,
          draw: game.in_draw?.() || false,
          legal_moves: legalMoves.length,
        },
        phase,
        material_class: materialClass,
        castling: castlingRightsFromFen(normalizedFen),
        attack_map_summary: buildAttackMapSummary(attackMap),
        material: {
          white: material.white.total,
          black: material.black.total,
          imbalance: material.balance,
          detail: material,
        },
        mobility: {
          white: whiteLegalMoves.length,
          black: blackLegalMoves.length,
        },
        mobility_detail: {
          white: analyzeColorMobility(normalizedFen, "w", boardMap),
          black: analyzeColorMobility(normalizedFen, "b", boardMap),
        },
        pawn_structure: {
          white: {
            open_files: fileProfile.open,
            backward_pawns: detectBackwardPawns(boardMap, "w"),
            hanging_pair: detectHangingPawnPair(boardMap, "w"),
            candidate_passers: detectCandidatePassedPawns(boardMap, "w"),
            tripled_files: detectTripledPawns(boardMap, "w"),
            passed_features: detectPassedPawnFeatures(boardMap, "w"),
            pawn_breaks: detectPawnBreaks(
              boardMap,
              "w",
              whiteLegalMoves,
              whitePosition.fen,
            ),
            tension_pairs: detectPawnTension(boardMap),
            majority: pawnMajority.white,
            duos: detectPawnDuos(boardMap, "w"),
            wrong_bishop: detectWrongBishop(boardMap, "w"),
          },
          black: {
            open_files: fileProfile.open,
            backward_pawns: detectBackwardPawns(boardMap, "b"),
            hanging_pair: detectHangingPawnPair(boardMap, "b"),
            candidate_passers: detectCandidatePassedPawns(boardMap, "b"),
            tripled_files: detectTripledPawns(boardMap, "b"),
            passed_features: detectPassedPawnFeatures(boardMap, "b"),
            pawn_breaks: detectPawnBreaks(
              boardMap,
              "b",
              blackLegalMoves,
              blackPosition.fen,
            ),
            tension_pairs: detectPawnTension(boardMap),
            majority: pawnMajority.black,
            duos: detectPawnDuos(boardMap, "b"),
            wrong_bishop: detectWrongBishop(boardMap, "b"),
          },
          structural_archetype: detectStructuralArchetype(boardMap),
          color_complex: {
            white: detectColorComplexWeakness(boardMap, "w"),
            black: detectColorComplexWeakness(boardMap, "b"),
          },
        },
        files: {
          open: fileProfile.open,
          half_open_white: fileProfile.semi_open.white,
          half_open_black: fileProfile.semi_open.black,
        },
        piece_activity: {
          white: {
            development: whiteDevelopment,
            knight_outposts: whiteOutposts.occupied,
            available_outposts: whiteOutposts.available,
            bad_bishops: detectBadBishops(boardMap, "w"),
            bishop_pair: bishopPair.white,
            rooks: detectRookActivity(boardMap, "w"),
            connected_rooks: detectConnectedRooks(boardMap, "w"),
            batteries: detectBatteries(boardMap, "w"),
            trapped_pieces: detectTrappedPieces(
              boardMap,
              "w",
              whiteLegalMoves,
              attackMap,
            ),
            desperado_moves: whiteDesperado,
            queen_exposure: detectQueenExposure(
              boardMap,
              "w",
              blackLegalMoves,
            ),
            best_piece: null,
            worst_piece: null,
          },
          black: {
            development: blackDevelopment,
            knight_outposts: blackOutposts.occupied,
            available_outposts: blackOutposts.available,
            bad_bishops: detectBadBishops(boardMap, "b"),
            bishop_pair: bishopPair.black,
            rooks: detectRookActivity(boardMap, "b"),
            connected_rooks: detectConnectedRooks(boardMap, "b"),
            batteries: detectBatteries(boardMap, "b"),
            trapped_pieces: detectTrappedPieces(
              boardMap,
              "b",
              blackLegalMoves,
              attackMap,
            ),
            desperado_moves: blackDesperado,
            queen_exposure: detectQueenExposure(
              boardMap,
              "b",
              whiteLegalMoves,
            ),
            best_piece: null,
            worst_piece: null,
          },
          material_imbalances: detectMaterialImbalances(boardMap),
        },
        king_safety: {
          white: {
            safety_score:
              Math.max(0, 6 - Math.round(whiteKingTropism.score)) +
              (game.turn() === "w" && game.in_check?.() ? -2 : 0),
            shelter_score: 0,
            tropism: whiteKingTropism,
            escape_squares: whiteEscapeSquares,
            back_rank_weakness: whiteBackRank,
            open_diagonals: detectOpenDiagonalsToKing(boardMap, "w"),
            zone_attacks: detectKingZoneAttacks(boardMap, "w", attackMap),
            king_activity: detectKingActivityScore(boardMap, "w", phase),
          },
          black: {
            safety_score:
              Math.max(0, 6 - Math.round(blackKingTropism.score)) +
              (game.turn() === "b" && game.in_check?.() ? -2 : 0),
            shelter_score: 0,
            tropism: blackKingTropism,
            escape_squares: blackEscapeSquares,
            back_rank_weakness: blackBackRank,
            open_diagonals: detectOpenDiagonalsToKing(boardMap, "b"),
            zone_attacks: detectKingZoneAttacks(boardMap, "b", attackMap),
            king_activity: detectKingActivityScore(boardMap, "b", phase),
          },
          opposition: detectDistantOpposition(boardMap, sideToMove),
        },
        space_and_control: {
          center: centerControl,
          white_space: detectSpaceScore(boardMap, attackMap, "w").score,
          black_space: detectSpaceScore(boardMap, attackMap, "b").score,
          weak_squares: {
            white: weakStrongSquares.white.weak_squares,
            black: weakStrongSquares.black.weak_squares,
          },
          strong_squares: {
            white: weakStrongSquares.white.strong_squares,
            black: weakStrongSquares.black.strong_squares,
          },
          invasion_squares: {
            white: detectInvasionSquares(boardMap, "w", attackMap),
            black: detectInvasionSquares(boardMap, "b", attackMap),
          },
          long_diagonals: [
            ...detectLongDiagonalControl(boardMap, "w").map((entry) => ({
              ...entry,
              color: "white",
            })),
            ...detectLongDiagonalControl(boardMap, "b").map((entry) => ({
              ...entry,
              color: "black",
            })),
          ],
          critical_line_blockers: {
            white: detectCriticalLineBlockers(boardMap, "w"),
            black: detectCriticalLineBlockers(boardMap, "b"),
          },
        },
        tactical_features: {
          pins: {
            white: detectAbsolutePins(boardMap, "w"),
            black: detectAbsolutePins(boardMap, "b"),
          },
          checking_moves: legalMoves
            .filter((move) => /[+#]/.test(move.san))
            .map((move) => move.san)
            .slice(0, 6),
          capture_threats: legalMoves
            .filter(
              (move) =>
                String(move.flags || "").includes("c") ||
                String(move.flags || "").includes("e"),
            )
            .map((move) => move.san)
            .slice(0, 8),
          opponent_checking_moves: (
            enemyColor === "w" ? whiteLegalMoves : blackLegalMoves
          )
            .filter((move) => /[+#]/.test(move.san))
            .map((move) => move.san)
            .slice(0, 6),
          opponent_capture_threats: (
            enemyColor === "w" ? whiteLegalMoves : blackLegalMoves
          )
            .filter(
              (move) =>
                String(move.flags || "").includes("c") ||
                String(move.flags || "").includes("e"),
            )
            .map((move) => move.san)
            .slice(0, 8),
          forks: [
            ...detectForks(boardMap, "w", whiteLegalMoves, whitePosition.fen).map(
              (entry) => ({ ...entry, color: "white" }),
            ),
            ...detectForks(boardMap, "b", blackLegalMoves, blackPosition.fen).map(
              (entry) => ({ ...entry, color: "black" }),
            ),
          ].slice(0, 10),
          check_threats: summarizeCheckThreats(game),
          skewers: {
            white: detectSkewers(boardMap, "w"),
            black: detectSkewers(boardMap, "b"),
          },
          promotion_threats: {
            white: detectPromotionThreats(boardMap, "w"),
            black: detectPromotionThreats(boardMap, "b"),
          },
          hanging_pieces: {
            white: whiteHanging,
            black: blackHanging,
          },
          underdefended_pieces: {
            white: whiteUnderdefended,
            black: blackUnderdefended,
          },
          overloaded_pieces: {
            white: overloadedPieces.filter(
              (entry) => (boardMap.get(entry.square)?.color || "") === "w",
            ),
            black: overloadedPieces.filter(
              (entry) => (boardMap.get(entry.square)?.color || "") === "b",
            ),
          },
          relative_pins: {
            white: detectRelativePins(boardMap, "w"),
            black: detectRelativePins(boardMap, "b"),
          },
          discovered_attacks: {
            white: whiteDiscovered.attacks,
            black: blackDiscovered.attacks,
          },
          discovered_checks: {
            white: whiteDiscovered.checks,
            black: blackDiscovered.checks,
          },
          double_checks: {
            white: whiteDiscovered.double_checks,
            black: blackDiscovered.double_checks,
          },
          x_ray_attacks: {
            white: detectXRayAttacks(boardMap, "w"),
            black: detectXRayAttacks(boardMap, "b"),
          },
          cross_checks: [
            ...detectCrossChecks(boardMap, "w", whitePosition.game).map(
              (entry) => ({
                ...entry,
                color: "white",
              }),
            ),
            ...detectCrossChecks(boardMap, "b", blackPosition.game).map(
              (entry) => ({
                ...entry,
                color: "black",
              }),
            ),
          ].slice(0, 8),
          trapped_pieces: {
            white: detectTrappedPieces(boardMap, "w", whiteLegalMoves, attackMap),
            black: detectTrappedPieces(boardMap, "b", blackLegalMoves, attackMap),
          },
          desperado_moves: {
            white: whiteDesperado,
            black: blackDesperado,
          },
          mating_patterns: detectMatingPatterns(boardMap, game),
        },
        endgame: {
          rule_of_square: detectRuleOfSquare(boardMap, sideToMove),
          opposite_bishops: detectOppositeBishops(boardMap),
          insufficient_material: detectInsufficientMaterial(boardMap),
          fifty_move: detectFiftyMoveProximity(halfmoveClock),
          rook_endgame_patterns: detectRookEndgamePatterns(boardMap),
          king_activity: {
            white: detectKingActivityScore(boardMap, "w", phase),
            black: detectKingActivityScore(boardMap, "b", phase),
          },
        },
        dynamics: {
          forcing_profile: forcingProfile,
          initiative: detectInitiative(
            boardMap,
            sideToMove,
            attackMap,
            phase,
            forcingProfile,
            enemyForcingProfile,
            sideToMove === "w" ? whiteDevelopment : blackDevelopment,
            sideToMove === "w" ? blackDevelopment : whiteDevelopment,
          ),
        },
        king_opposition: detectKingOpposition(boardMap, sideToMove),
        summary: [],
      });
      features.summary = buildFeatureSummary(features);
      _positionFeaturesCache.set(normalizedFen, features);
      while (_positionFeaturesCache.size > 128) {
        const oldest = _positionFeaturesCache.keys().next();
        if (oldest.done) break;
        _positionFeaturesCache.delete(oldest.value);
      }
      return features;
    } catch (_) {
      return emptyPositionFeatures(normalizedFen);
    }
  }

  function nodeOnCurrentPathByFen(fen) {
    const normalizedFen = normalizeToolFen(fen);
    const path = currentPath();
    for (let index = path.length - 1; index >= 0; index -= 1) {
      if (path[index].fen === normalizedFen) return path[index];
    }
    return null;
  }

  async function getOpeningNameTool(input = {}) {
    await ensureOpeningBookLoaded();
    const normalizedFen = normalizeToolFen(input.fen);
    const exact = openingBookInfoForFen(normalizedFen);
    if (exact) {
      return {
        ok: true,
        fen: normalizedFen,
        exact_match: true,
        matched_fen: normalizedFen,
        opening: exact,
      };
    }
    const node = nodeOnCurrentPathByFen(normalizedFen);
    if (node) {
      const path = pathToNode(node);
      for (let index = path.length - 1; index >= 1; index -= 1) {
        const info = openingBookInfoForFen(path[index].fen);
        if (info) {
          return {
            ok: true,
            fen: normalizedFen,
            exact_match: false,
            matched_fen: path[index].fen,
            opening: info,
          };
        }
      }
    }
    return {
      ok: false,
      fen: normalizedFen,
      reason:
        "No opening-book name was found for this position or its current-line ancestors.",
    };
  }

  async function getWikibooksContextTool(input = {}) {
    const normalizedFen = normalizeToolFen(input.fen);
    if (normalizedFen === state.current?.fen && state.openingWiki?.summary) {
      return {
        ok: true,
        fen: normalizedFen,
        title: state.openingWiki.title || "",
        summary: state.openingWiki.summary,
        cached: true,
      };
    }
    const node = nodeOnCurrentPathByFen(normalizedFen);
    if (!node) {
      return {
        ok: false,
        fen: normalizedFen,
        reason:
          "This FEN is not on the current move path, so there is no matching Wikibooks path to fetch.",
      };
    }
    const segments = wikibookSegmentsForNode(node);
    if (!isWikibookEligible(state.root?.fen || START_FEN, segments)) {
      return {
        ok: false,
        fen: normalizedFen,
        reason:
          "Wikibooks opening context is only available for opening-phase positions from the standard start position.",
      };
    }
    const data = await loadWikibooksDataForSegments(
      state.root?.fen || START_FEN,
      segments,
    );
    if (normalizedFen === state.current?.fen) {
      state.openingWiki = data?.summary
        ? { title: data.title || "", summary: data.summary }
        : null;
      renderOpening();
    }
    if (!data?.summary) {
      return {
        ok: false,
        fen: normalizedFen,
        title: data?.title || "",
        reason: "No Wikibooks summary was found for this position.",
      };
    }
    return {
      ok: true,
      fen: normalizedFen,
      title: data.title || "",
      name: data.name || "",
      summary: data.summary,
      segments,
    };
  }

  function getGameHistoryTool(input = {}) {
    const maxMoves = clampInt(input.max_moves, 1, 400, 200);
    const path = visibleHistoryPath().slice(1, maxMoves + 1);
    const moves = path.map((node, index) => {
      const evalInfo = historyEvalForNode(node);
      const previousEval =
        index > 0 ? historyEvalForNode(path[index - 1]) : null;
      const moveClass = classificationForHistoryNode(node);
      return {
        ply: index + 1,
        label: nodeDisplayLabel(node),
        san: node.san,
        uci: node.uci,
        fen: node.fen,
        eval: evalInfo?.label || "",
        move_class: moveClass?.label || "",
        swing:
          evalInfo?.hasEval && previousEval?.hasEval
            ? Number((evalInfo.value - previousEval.value).toFixed(2))
            : null,
      };
    });
    const swings = moves
      .filter((move) => Number.isFinite(move.swing))
      .map((move) => ({ ...move, swing_abs: Math.abs(move.swing) }))
      .sort((a, b) => b.swing_abs - a.swing_abs || a.ply - b.ply)
      .slice(0, 8)
      .map(({ swing_abs, ...move }) => move);
    return {
      ok: true,
      move_count: moves.length,
      current_ply: currentPath().length - 1,
      opening: state.openingInfo?.name
        ? { eco: state.openingInfo.eco || "", name: state.openingInfo.name }
        : null,
      moves,
      major_swings: swings,
    };
  }

  function applyMoveToGame(game, moveInput) {
    const rawMove = String(moveInput || "").trim();
    if (!rawMove) return null;
    const parsed = parseUci(rawMove);
    if (parsed) {
      try {
        const played = game.move({
          from: parsed.from,
          to: parsed.to,
          promotion: parsed.promotion || undefined,
        });
        if (played) return played;
      } catch (_) {}
    }
    try {
      return game.move(rawMove, { sloppy: true });
    } catch (_) {
      return null;
    }
  }

  function applyMoveTool(input = {}) {
    const normalizedFen = normalizeToolFen(input.fen);
    const game = new Chess(normalizedFen);
    const played = applyMoveToGame(game, input.move);
    if (!played) {
      return {
        ok: false,
        fen: normalizedFen,
        error: `Illegal or unrecognized move: ${input.move}`,
      };
    }
    return {
      ok: true,
      fen: game.fen(),
      move_san: played.san,
      move_uci: played.from + played.to + (played.promotion || ""),
      side_to_move: game.turn() === "w" ? "white" : "black",
    };
  }

  function getLegalMovesTool(input = {}) {
    const normalizedFen = normalizeToolFen(input.fen);
    try {
      const game = new Chess(normalizedFen);
      const fromSquare = String(input.from_square || "")
        .trim()
        .toLowerCase();
      const maxMoves = clampInt(input.max_moves, 1, 256, 80);
      const verboseMoves = game
        .moves({ verbose: true })
        .filter((move) => !fromSquare || move.from === fromSquare)
        .slice(0, maxMoves)
        .map((move) => ({
          san: move.san,
          uci: move.from + move.to + (move.promotion || ""),
          from: move.from,
          to: move.to,
          piece: move.piece,
          capture:
            String(move.flags || "").includes("c") ||
            String(move.flags || "").includes("e"),
          check: /[+#]/.test(move.san),
          promotion: move.promotion || null,
        }));
      return {
        ok: true,
        fen: normalizedFen,
        side_to_move: game.turn() === "w" ? "white" : "black",
        from_square: fromSquare || null,
        total_legal_moves: game.moves().length,
        returned_moves: verboseMoves.length,
        legal_moves: verboseMoves,
      };
    } catch (error) {
      return {
        ok: false,
        fen: normalizedFen,
        error: error?.message || String(error),
      };
    }
  }

  function keyedEntryDiff(afterEntries, beforeEntries, keyFn) {
    try {
      const seen = new Set((beforeEntries || []).map((entry) => keyFn(entry)));
      return (afterEntries || []).filter((entry) => !seen.has(keyFn(entry)));
    } catch (_) {
      return Array.isArray(afterEntries) ? afterEntries : [];
    }
  }

  function summarizeMobilityShift(beforeProfile, afterProfile, excludedSquares = []) {
    try {
      const excluded = new Set(excludedSquares);
      const beforeMap = new Map(
        (beforeProfile?.by_piece || []).map((entry) => [entry.square, entry]),
      );
      const afterMap = new Map(
        (afterProfile?.by_piece || []).map((entry) => [entry.square, entry]),
      );
      const squares = new Set([...beforeMap.keys(), ...afterMap.keys()]);
      return Array.from(squares)
        .filter((square) => !excluded.has(square))
        .map((square) => {
          const before = beforeMap.get(square);
          const after = afterMap.get(square);
          const beforeMoves = before?.legal_moves || 0;
          const afterMoves = after?.legal_moves || 0;
          return {
            square,
            piece: after?.piece || before?.piece || "",
            legal_moves_before: beforeMoves,
            legal_moves_after: afterMoves,
            delta: afterMoves - beforeMoves,
          };
        })
        .filter((entry) => entry.delta !== 0)
        .sort(
          (a, b) =>
            Math.abs(b.delta) - Math.abs(a.delta) ||
            a.square.localeCompare(b.square),
        )
        .slice(0, 6);
    } catch (_) {
      return [];
    }
  }

  function describeMoveEffectsTool(input = {}) {
    const normalizedFen = normalizeToolFen(input.fen);
    try {
      const beforeGame = new Chess(normalizedFen);
      const beforeBoard = buildBoardMap(beforeGame);
      const beforeFeatures = computePositionFeatures(normalizedFen);
      const beforeCastling = castlingRightsFromFen(normalizedFen);
      const beforeMobilityWhite = analyzeColorMobility(
        normalizedFen,
        "w",
        beforeBoard,
      );
      const beforeMobilityBlack = analyzeColorMobility(
        normalizedFen,
        "b",
        beforeBoard,
      );
      const played = applyMoveToGame(beforeGame, input.move);
      if (!played) {
        return {
          ok: false,
          fen: normalizedFen,
          error: `Illegal or unrecognized move: ${input.move}`,
        };
      }

      const moverColor = beforeBoard.get(played.from)?.color || "w";
      const moverKey = colorName(moverColor);
      const enemyKey = colorName(moverColor === "w" ? "b" : "w");
      const afterFen = beforeGame.fen();
      const afterBoard = buildBoardMap(beforeGame);
      const afterFeatures = computePositionFeatures(afterFen);
      const afterCastling = castlingRightsFromFen(afterFen);
      const afterMobilityWhite = analyzeColorMobility(afterFen, "w", afterBoard);
      const afterMobilityBlack = analyzeColorMobility(afterFen, "b", afterBoard);
      const movedBeforePiece = beforeBoard.get(played.from);
      const movedAfterPiece = afterBoard.get(played.to);
      const movedAttackSquaresBefore = movedBeforePiece
        ? attackSquaresForPiece(beforeBoard, played.from, movedBeforePiece)
        : [];
      const movedAttackSquaresAfter = movedAfterPiece
        ? attackSquaresForPiece(afterBoard, played.to, movedAfterPiece)
        : [];
      const newEnemyHanging = keyedEntryDiff(
        afterFeatures?.tactical_features?.hanging_pieces?.[enemyKey] || [],
        beforeFeatures?.tactical_features?.hanging_pieces?.[enemyKey] || [],
        (entry) => `${entry.square}:${entry.piece || ""}`,
      );
      const newOwnHanging = keyedEntryDiff(
        afterFeatures?.tactical_features?.hanging_pieces?.[moverKey] || [],
        beforeFeatures?.tactical_features?.hanging_pieces?.[moverKey] || [],
        (entry) => `${entry.square}:${entry.piece || ""}`,
      );
      const newPinsOnEnemy = keyedEntryDiff(
        afterFeatures?.tactical_features?.pins?.[enemyKey] || [],
        beforeFeatures?.tactical_features?.pins?.[enemyKey] || [],
        (entry) => `${entry.square}:${entry.attacker_square || ""}`,
      );
      const newSkewersOnEnemy = keyedEntryDiff(
        afterFeatures?.tactical_features?.skewers?.[enemyKey] || [],
        beforeFeatures?.tactical_features?.skewers?.[enemyKey] || [],
        (entry) =>
          `${entry.front_square || ""}:${entry.behind_square || ""}:${entry.attacker_square || ""}`,
      );
      const newXRays = keyedEntryDiff(
        afterFeatures?.tactical_features?.x_ray_attacks?.[moverKey] || [],
        beforeFeatures?.tactical_features?.x_ray_attacks?.[moverKey] || [],
        (entry) =>
          `${entry.attacker_square || ""}:${entry.screen_square || ""}:${entry.target_square || ""}`,
      );
      const newForks = keyedEntryDiff(
        (afterFeatures?.tactical_features?.forks || []).filter(
          (entry) => entry.color === moverKey,
        ),
        (beforeFeatures?.tactical_features?.forks || []).filter(
          (entry) => entry.color === moverKey,
        ),
        (entry) => entry.move_uci,
      );
      const newDiscoveredAttacks = keyedEntryDiff(
        afterFeatures?.tactical_features?.discovered_attacks?.[moverKey] || [],
        beforeFeatures?.tactical_features?.discovered_attacks?.[moverKey] || [],
        (entry) =>
          `${entry.move_uci || ""}:${entry.revealed_attacker_square || ""}:${entry.target_square || ""}`,
      );
      const newDiscoveredChecks = keyedEntryDiff(
        afterFeatures?.tactical_features?.discovered_checks?.[moverKey] || [],
        beforeFeatures?.tactical_features?.discovered_checks?.[moverKey] || [],
        (entry) =>
          `${entry.move_uci || ""}:${entry.revealed_attacker_square || ""}:${entry.target_square || ""}`,
      );
      const castlingChanged = {
        white_before: beforeCastling.white_kingside || beforeCastling.white_queenside,
        white_after: afterCastling.white_kingside || afterCastling.white_queenside,
        black_before: beforeCastling.black_kingside || beforeCastling.black_queenside,
        black_after: afterCastling.black_kingside || afterCastling.black_queenside,
      };
      const summary = [];
      if (played.captured) {
        summary.push(
          `${played.san} captures ${pieceName(played.captured)} on ${played.to}.`,
        );
      }
      if (afterFeatures?.status?.checkmate) {
        summary.push(`${played.san} ends the game immediately by checkmate.`);
      } else if (afterFeatures?.status?.in_check) {
        summary.push(`${played.san} gives check and forces a response.`);
      }
      if (newForks.length) {
        summary.push(`${played.san} creates a fork for ${moverKey}.`);
      }
      if (newPinsOnEnemy.length) {
        summary.push(`${played.san} pins an enemy piece.`);
      }
      if (newSkewersOnEnemy.length) {
        summary.push(`${played.san} sets up a skewer against the enemy position.`);
      }
      if (newXRays.length) {
        summary.push(`${played.san} creates an x-ray line onto a more valuable target.`);
      }
      if (newEnemyHanging.length) {
        summary.push(`${played.san} leaves enemy material hanging.`);
      }
      if (
        castlingChanged.white_before !== castlingChanged.white_after ||
        castlingChanged.black_before !== castlingChanged.black_after
      ) {
        summary.push(`${played.san} changes castling rights and king safety.`);
      }

      return {
        ok: true,
        fen_before: normalizedFen,
        resulting_fen: afterFen,
        move_san: played.san,
        move_uci: played.from + played.to + (played.promotion || ""),
        mover: moverKey,
        next_side_to_move: afterFeatures?.side_to_move || colorName(beforeGame.turn()),
        immediate: {
          gives_check: afterFeatures?.status?.in_check || false,
          checkmate: afterFeatures?.status?.checkmate || false,
          stalemate: afterFeatures?.status?.stalemate || false,
          draw: afterFeatures?.status?.draw || false,
          captured_piece: played.captured ? pieceName(played.captured) : null,
          opponent_legal_replies: afterFeatures?.status?.legal_moves || 0,
          castling_rights_changed: castlingChanged,
        },
        moved_piece_activity: {
          piece: movedAfterPiece ? pieceCode(movedAfterPiece) : "",
          from: played.from,
          to: played.to,
          attack_count_before: movedAttackSquaresBefore.length,
          attack_count_after: movedAttackSquaresAfter.length,
          gained_attack_squares: movedAttackSquaresAfter.filter(
            (square) => !movedAttackSquaresBefore.includes(square),
          ),
          lost_attack_squares: movedAttackSquaresBefore.filter(
            (square) => !movedAttackSquaresAfter.includes(square),
          ),
        },
        mobility_shift: {
          white: summarizeMobilityShift(beforeMobilityWhite, afterMobilityWhite, [
            played.from,
            played.to,
          ]),
          black: summarizeMobilityShift(beforeMobilityBlack, afterMobilityBlack, [
            played.from,
            played.to,
          ]),
        },
        structural_shift: {
          center_control_delta:
            (afterFeatures?.space_and_control?.center?.white_total || 0) -
              (beforeFeatures?.space_and_control?.center?.white_total || 0) !==
              0 ||
            (afterFeatures?.space_and_control?.center?.black_total || 0) -
              (beforeFeatures?.space_and_control?.center?.black_total || 0) !==
              0
              ? {
                  white:
                    (afterFeatures?.space_and_control?.center?.white_total || 0) -
                    (beforeFeatures?.space_and_control?.center?.white_total || 0),
                  black:
                    (afterFeatures?.space_and_control?.center?.black_total || 0) -
                    (beforeFeatures?.space_and_control?.center?.black_total || 0),
                }
              : null,
          development_delta: {
            white:
              (afterFeatures?.piece_activity?.white?.development
                ?.development_score || 0) -
              (beforeFeatures?.piece_activity?.white?.development
                ?.development_score || 0),
            black:
              (afterFeatures?.piece_activity?.black?.development
                ?.development_score || 0) -
              (beforeFeatures?.piece_activity?.black?.development
                ?.development_score || 0),
          },
          king_safety_delta: {
            white:
              (afterFeatures?.king_safety?.white?.safety_score || 0) -
              (beforeFeatures?.king_safety?.white?.safety_score || 0),
            black:
              (afterFeatures?.king_safety?.black?.safety_score || 0) -
              (beforeFeatures?.king_safety?.black?.safety_score || 0),
          },
        },
        tactical_shift: {
          new_enemy_hanging: newEnemyHanging,
          new_own_hanging: newOwnHanging,
          new_forks: newForks,
          new_pins_on_enemy: newPinsOnEnemy,
          new_skewers_on_enemy: newSkewersOnEnemy,
          new_x_ray_attacks: newXRays,
          new_discovered_attacks: newDiscoveredAttacks,
          new_discovered_checks: newDiscoveredChecks,
        },
        summary,
      };
    } catch (error) {
      return {
        ok: false,
        fen: normalizedFen,
        error: error?.message || String(error),
      };
    }
  }

  function compareMoveScore(row) {
    if (!row) return -Infinity;
    if (Number.isFinite(row.mate)) {
      return row.mate > 0 ? -(100000 - row.mate) : 100000 + row.mate;
    }
    if (Number.isFinite(row.cp)) return -(row.cp || 0);
    return -Infinity;
  }

  function compareMovesVerdict(candidates) {
    const successful = candidates.filter(
      (candidate) =>
        candidate.ok !== false && Number.isFinite(candidate._score),
    );
    if (successful.length < 2) return "";
    const ranked = successful.slice().sort((a, b) => b._score - a._score);
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    if (!best || !worst || best === worst) return "";
    const bestLabel = best.move_san || best.move_uci || best.move_input;
    const worstLabel = worst.move_san || worst.move_uci || worst.move_input;
    if (Number.isFinite(best.cp_after) && Number.isFinite(worst.cp_after)) {
      const cpDiff = Math.abs(best._score - worst._score);
      return `${bestLabel} (${best.eval_after}) is decisively better than ${worstLabel} (${worst.eval_after}) - the difference is ${Math.round(cpDiff)} centipawns.`;
    }
    return `${bestLabel} (${best.eval_after}) is decisively better than ${worstLabel} (${worst.eval_after}) based on the resulting engine evaluations.`;
  }

  async function compareMovesTool(input = {}) {
    const baselineFen = normalizeToolFen(input.fen);
    const moves = Array.isArray(input.moves)
      ? input.moves.map((move) => String(move || "").trim()).filter(Boolean)
      : [];
    if (moves.length < 2 || moves.length > 4) {
      return {
        ok: false,
        baseline_fen: baselineFen,
        error: "compare_moves requires an array of 2 to 4 candidate moves.",
      };
    }
    const movetimeMs = clampInt(input.movetime_ms, 200, 8000, 1500);
    const candidates = [];
    for (const moveInput of moves) {
      const game = new Chess(baselineFen);
      const played = applyMoveToGame(game, moveInput);
      if (!played) {
        candidates.push({
          move_input: moveInput,
          ok: false,
          error: "Illegal move",
        });
        continue;
      }
      const resultingFen = game.fen();
      let analysis = null;
      try {
        analysis = await runPersistentToolEngineAnalysis(
          resultingFen,
          movetimeMs,
          2,
        );
      } catch (_) {
        try {
          analysis = await runTemporaryStockfishAnalyze(
            resultingFen,
            movetimeMs,
            2,
          );
        } catch (error) {
          candidates.push({
            move_input: moveInput,
            move_san: played.san,
            move_uci: played.from + played.to + (played.promotion || ""),
            resulting_fen: resultingFen,
            ok: false,
            error: error?.message || String(error),
          });
          continue;
        }
      }
      const bestRow = analysis?.rows?.[0] || null;
      const candidate = {
        ok: true,
        move_input: moveInput,
        move_san: played.san,
        move_uci: played.from + played.to + (played.promotion || ""),
        resulting_fen: resultingFen,
        eval_after: bestRow?.eval || "",
        cp_after: Number.isFinite(bestRow?.cp) ? bestRow.cp : null,
        best_response_san: bestRow?.move || "",
        top_line: bestRow?.continuation || "",
      };
      candidate._score = compareMoveScore(bestRow);
      candidates.push(candidate);
    }
    const publicCandidates = candidates.map((candidate) => {
      if (
        !candidate ||
        !Object.prototype.hasOwnProperty.call(candidate, "_score")
      )
        return candidate;
      const { _score, ...rest } = candidate;
      return rest;
    });
    return {
      ok: true,
      baseline_fen: baselineFen,
      movetime_ms: movetimeMs,
      candidates: publicCandidates,
      verdict: compareMovesVerdict(candidates),
    };
  }

  function runTemporaryStockfishAnalyze(fen, movetimeMs, lines) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let worker = null;
      const rowsByPv = new Map();
      let bestmove = "";
      const finish = (result, error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (worker) worker.terminate();
        if (error) reject(error);
        else resolve(result);
      };
      const timeout = setTimeout(() => {
        finish({
          ok: false,
          fen,
          error: "Stockfish tool call timed out.",
        });
      }, movetimeMs + 8000);
      try {
        worker = new Worker(ENGINE_SCRIPT);
      } catch (error) {
        finish(null, error);
        return;
      }
      worker.onerror = (error) => finish(null, error);
      worker.onmessage = (event) => {
        for (const line of normalizeEnginePayload(event.data)) {
          if (line === "uciok") {
            worker.postMessage("setoption name UCI_ShowWDL value true");
            worker.postMessage(`setoption name Threads value ${state.threads}`);
            worker.postMessage("setoption name Hash value 12");
            worker.postMessage(`setoption name MultiPV value ${lines}`);
            worker.postMessage("isready");
            continue;
          }
          if (line === "readyok") {
            worker.postMessage(`position fen ${fen}`);
            worker.postMessage(`go movetime ${movetimeMs}`);
            continue;
          }
          if (line.startsWith("info ")) {
            const row = parseInfoLine(line, fen);
            if (row) rowsByPv.set(row.multipv, row);
            continue;
          }
          if (line.startsWith("bestmove ")) {
            bestmove = line.split(/\s+/)[1] || "";
            const rows = normalizeAnalysisRows(
              Array.from(rowsByPv.values()).sort(
                (a, b) => a.multipv - b.multipv,
              ),
            )
              .slice(0, lines)
              .map((row) => enrichRowWithPVSan(row, fen))
              .map((row, index) => ({
                rank: index + 1,
                uci: row.bestUci,
                move: analysisLeadText(row, fen),
                continuation: row.restSan || "",
                eval: row.evalText,
                depth: row.depth || 0,
                nodes: row.nodes || 0,
                mate: Number.isFinite(row.mate) ? row.mate : null,
                cp: Number.isFinite(row.scoreCp) ? row.scoreCp : null,
              }));
            finish({
              ok: true,
              fen,
              movetime_ms: movetimeMs,
              lines_requested: lines,
              bestmove,
              rows,
            });
          }
        }
      };
      worker.postMessage("uci");
    });
  }

  function runPersistentToolEngineAnalysis(fen, movetimeMs, lines) {
    return new Promise((resolve, reject) => {
      if (!state.toolEngineReady || !state.toolEngine || state.toolEngineBusy) {
        reject(new Error("Persistent tool engine unavailable"));
        return;
      }
      state.toolEngineBusy = true;
      state.toolEngineStopRequested = false;
      const timeout = setTimeout(() => {
        if (_toolEngineTask?.reject === reject) {
          _toolEngineTask = null;
          state.toolEngineBusy = false;
          state.toolEngineStopRequested = true;
          sendToolEngine("stop");
          reject(new Error("Stockfish tool call timed out."));
        }
      }, movetimeMs + 8000);
      _toolEngineTask = {
        fen,
        movetimeMs,
        lines,
        rowsByPv: new Map(),
        resolve,
        reject,
        timeout,
      };
      syncToolEngineOptions(lines);
      sendToolEngine(`position fen ${fen}`);
      sendToolEngine(`go movetime ${movetimeMs}`);
    });
  }

  async function stockfishAnalyzeTool(input = {}) {
    const normalizedFen = normalizeToolFen(input.fen);
    const movetimeMs = clampInt(input.movetime_ms, 50, 20000, 1200);
    const lines = clampInt(input.lines, 1, 10, 3);
    const terminal = terminalPositionInfo(new Chess(normalizedFen));
    if (terminal) {
      return {
        ok: true,
        fen: normalizedFen,
        movetime_ms: movetimeMs,
        lines_requested: lines,
        terminal,
        rows: [],
      };
    }
    if (state.toolEngineReady && state.toolEngine && !state.toolEngineBusy) {
      try {
        return await runPersistentToolEngineAnalysis(
          normalizedFen,
          movetimeMs,
          lines,
        );
      } catch (_) {}
    }
    return runTemporaryStockfishAnalyze(normalizedFen, movetimeMs, lines);
  }

  async function executeCoachTool(toolUse) {
    const name = String(toolUse?.name || "");
    const input =
      toolUse?.input && typeof toolUse.input === "object" ? toolUse.input : {};
    state.llmToolStatus = coachToolLabel(name);
    renderAssistant();
    try {
      switch (name) {
        case "stockfish_analyze":
          return await stockfishAnalyzeTool(input);
        case "get_position_features":
          return computePositionFeatures(input.fen);
        case "get_legal_moves":
          return getLegalMovesTool(input);
        case "describe_move_effects":
          return describeMoveEffectsTool(input);
        case "get_game_history":
          return getGameHistoryTool(input);
        case "apply_move":
          return applyMoveTool(input);
        case "compare_moves":
          return await compareMovesTool(input);
        case "get_opening_name":
          return await getOpeningNameTool(input);
        case "get_wikibooks_context":
          return await getWikibooksContextTool(input);
        default:
          return { ok: false, error: `Unknown tool: ${name}` };
      }
    } catch (error) {
      return {
        ok: false,
        error: error?.message || String(error),
      };
    }
  }

  function coachAnalysisRowsPayloadForFen(fen) {
    if (!fen) return [];
    return fullPositionRowsForFen(fen)
      .slice(0, 10)
      .map((row, index) => ({
        bestUci: String(row?.bestUci || ""),
        pv: Array.isArray(row?.pv) ? row.pv.map((move) => String(move || "")) : [],
        scoreCp:
          Number.isFinite(Number(row?.scoreCp)) ? Number(row.scoreCp) : null,
        mate: Number.isFinite(Number(row?.mate)) ? Number(row.mate) : null,
        depth: Number.isFinite(Number(row?.depth)) ? Number(row.depth) : 0,
        multipv: index + 1,
        firstSan: String(row?.firstSan || ""),
      }));
  }

  async function autoCoachComment() {
    if (!state.coachEnabled) return;
    if (
      !state.llmApiKey &&
      !(
        INITIAL_COACH_SETTINGS &&
        providerIsConfigured(state.llmProvider)
      )
    ) {
      return;
    }
    const currentFen = state.current?.fen;
    const moveUci = state.current?.uci;
    const prevFen = state.current?.parent?.fen;
    // Skip if this FEN was already explained by chat-coach
    if (currentFen && state.llmExplainedFens.has(currentFen)) {
      return;
    }
    // Only trigger after a real move has been played (has a parent node)
    if (!currentFen || !moveUci || !state.current?.parent) return;
    try {
      const response = await fetch("/api/analyze/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: state.llmProvider,
          apiKey: state.llmApiKey,
          model:
            state.llmModel || defaultCoachModelForProvider(state.llmProvider),
          auto: true,
          fen: currentFen,
          move: moveUci,
          prevFen,
          analysisRows: coachAnalysisRowsPayloadForFen(currentFen),
          prevAnalysisRows: coachAnalysisRowsPayloadForFen(prevFen),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        console.error("Auto-coach error:", payload?.error);
        return;
      }
      const explanation = payload?.explanation;
      if (explanation) {
        pushMessage("assistant", explanation, "auto-coach");
      }
    } catch (error) {
      console.error("Auto-coach failed:", error);
    }
  }

  async function requestCoachExplanation({
    userText,
    fen,
    prevFen,
    move,
  }) {
    const response = await fetch("/api/analyze/coach/explain", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider: state.llmProvider,
        apiKey: state.llmApiKey,
        model:
          state.llmModel || defaultCoachModelForProvider(state.llmProvider),
        fen,
        prevFen,
        move,
        analysisRows: coachAnalysisRowsPayloadForFen(fen),
        prevAnalysisRows: coachAnalysisRowsPayloadForFen(prevFen),
        personality: "coach",
        additionalPrompt: userText,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        payload?.error ||
          `Coach explain API error: ${response.status} ${response.statusText}`,
      );
    }
    return String(payload?.explanation || "");
  }

  function coachPromptMoveCandidates(prompt) {
    const text = String(prompt || "");
    const seen = new Set();
    const out = [];
    const push = (raw) => {
      const value = String(raw || "")
        .trim()
        .replace(/^\d+\.(\.\.)?/, "")
        .replace(/^[("'[{]+/, "")
        .replace(/[)"'\]}.,!?;:]+$/, "")
        .trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(value);
    };
    for (const match of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) push(match[1] || "");
    for (const match of text.matchAll(/\b([a-h][1-8][a-h][1-8][qrbn]?)\b/gi)) push(match[1] || "");
    for (const match of text.matchAll(/\b(?:O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)\b/g)) push(match[0] || "");
    return out;
  }

  function shouldUseCurrentMoveContext(userText, currentMoveUci, currentMoveSan) {
    const text = String(userText || "").toLowerCase();
    const asksConcreteWhy =
      /\bwhy\b/.test(text) &&
      /\b(blunder|mistake|inaccuracy|bad|lose|loses|fails)\b/.test(text);
    if (!asksConcreteWhy) return true;

    const candidates = coachPromptMoveCandidates(userText);
    if (!candidates.length) return true;

    const normalizedCurrent = new Set(
      [String(currentMoveUci || ""), String(currentMoveSan || "")]
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean),
    );
    if (!normalizedCurrent.size) return false;

    const matchesCurrent = candidates.some((candidate) =>
      normalizedCurrent.has(String(candidate || "").trim().toLowerCase()),
    );
    return matchesCurrent;
  }

  async function sendToCoach(userText) {
    if (state.llmWaiting) return;
    if (!isValidCoachProvider(state.llmProvider)) {
      state.llmProvider = defaultCoachProvider();
    }
    state.llmApiKey =
      ui.apiKeyInput.value.trim() ||
      localStorage.getItem(localApiKeyStorageKey(state.llmProvider)) ||
      "";
    state.llmModel =
      ui.modelInput.value.trim() ||
      localStorage.getItem(localModelStorageKey(state.llmProvider)) ||
      savedCoachModelForProvider(state.llmProvider) ||
      defaultCoachModelForProvider(state.llmProvider);
    localStorage.setItem(STORAGE.provider, state.llmProvider);
    localStorage.setItem(
      localApiKeyStorageKey(state.llmProvider),
      state.llmApiKey,
    );
    localStorage.setItem(
      localModelStorageKey(state.llmProvider),
      state.llmModel,
    );
    if (
      !state.llmApiKey &&
      !(
        INITIAL_COACH_SETTINGS &&
        providerIsConfigured(state.llmProvider)
      )
    ) {
      pushMessage(
        "system",
        `Add a ${providerDisplayName(state.llmProvider)} API key first, then type a question and press Send.`,
      );
      return;
    }
    pushMessage("user", userText);
    state.llmWaiting = true;
    state.llmToolStatus = "";
    renderAssistant();
    try {
      const currentFen = state.current?.fen || START_FEN;
      const prevFen = state.current?.parent?.fen;
      const moveUci = state.current?.uci;
      const moveSan = state.current?.san;
      const useCurrentMoveContext = shouldUseCurrentMoveContext(
        userText,
        moveUci,
        moveSan,
      );
      const currentTrail =
        currentPath()
          .slice(1)
          .map((node) => node.san)
          .join(" ") || "start position";
      state.llmTurnCount += 1;
      state.llmToolStatus = "Analyzing position...";
      renderAssistant();
      const finalText = await requestCoachExplanation({
        userText,
        fen: currentFen,
        prevFen: useCurrentMoveContext ? prevFen : undefined,
        move: useCurrentMoveContext ? moveUci : undefined,
      });
      state.llmConversation = trimConversationMessages([
        ...state.llmConversation,
        {
          role: "user",
          content: [{ type: "text", text: userText }],
        },
        {
          role: "assistant",
          content: [{ type: "text", text: finalText }],
        },
      ]);
      state.llmLastContextFen = currentFen;
      state.llmLastContextTrail = currentTrail;
      if (finalText) {
        // Track this FEN as explained so auto-coach skips it
        state.llmExplainedFens.add(currentFen);
        pushMessage("assistant", finalText);
      } else {
        pushMessage("system", "The coach returned no text. Try asking again.");
      }
    } catch (error) {
      pushMessage("system", error.message || String(error));
    } finally {
      state.llmWaiting = false;
      state.llmToolStatus = "";
      renderAssistant();
    }
  }

  function buildAssistantContext() {
    const path = currentPath()
      .slice(1)
      .map((node) => node.san)
      .join(" ");
    const top = visibleAnalysisRows()
      .slice(0, state.linesShown)
      .map(
        (row, i) =>
          `${i + 1}. ${row.firstSan || row.bestUci} (${row.evalText}, d${row.depth || "-"}, ${formatNodes(row.nodes)} nodes)`,
      )
      .join("\n");
    const openingName = state.openingInfo?.name
      ? `${state.openingInfo.eco ? `${state.openingInfo.eco} ` : ""}${state.openingInfo.name}`
      : "Unknown";
    const openingNotes = state.openingWiki?.summary
      ? `Opening notes from Wikibooks:\n${state.openingWiki.summary}`
      : "Opening notes from Wikibooks: not preloaded. Only fetch them if the user explicitly asks for opening prose or strategic notes.";
    return [
      `FEN: ${state.current.fen}`,
      `Move trail: ${path || "start position"}`,
      `Opening: ${openingName}`,
      openingNotes,
      `Engine mode: ${state.engineMode}`,
      `Top moves:\n${top || "No engine lines yet."}`,
    ].join("\n\n");
  }

  function normalizeCoachMoveToken(token) {
    const trimmed = String(token || "").trim();
    if (!trimmed) return "";
    return trimmed
      .replace(/^0-0-0$/i, "O-O-O")
      .replace(/^0-0$/i, "O-O");
  }

  function coachMoveClassForToken(token) {
    const san = normalizeCoachMoveToken(token);
    if (!san) return null;
    let matched = null;
    const path = currentPath();
    for (let index = 1; index < path.length; index += 1) {
      const node = path[index];
      if (normalizeCoachMoveToken(node?.san) !== san) continue;
      const moveClass = classificationForHistoryNode(node);
      if (!moveClass) continue;
      if (moveClass === MOVE_CLASS_STYLES.critical) return moveClass;
      matched = worseMoveClass(matched, moveClass);
    }
    if (matched) return matched;
    const fen = state.current?.fen || "";
    const game = currentGame();
    if (!fen || !game) return null;
    const legalMove = game.moves({ verbose: true }).find(
      (move) => normalizeCoachMoveToken(move.san) === san,
    );
    if (!legalMove) return null;
    const uci = `${legalMove.from}${legalMove.to}${legalMove.promotion || ""}`;
    return classificationForFenAndUci(fen, uci, game);
  }

  function renderCoachMoveToken(move) {
    const moveClass = coachMoveClassForToken(move);
    if (!moveClass) return `<code class="move-token">${escapeHtml(move)}</code>`;
    return `<code class="move-token classified" style="--move-class:${escapeHtml(moveClass.color)};--move-soft:${escapeHtml(moveClass.soft)};--move-border:${escapeHtml(moveClass.border)}" title="${escapeHtml(moveClass.label)}">${escapeHtml(move)}</code>`;
  }

  function renderCoachInline(text) {
    const isStandaloneMoveToken = (value) =>
      /^(?:O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)$/i.test(
        normalizeCoachMoveToken(value),
      );
    const codeSpans = [];
    let html = escapeHtml(String(text || "")).replace(
      /`([^`]+)`/g,
      (_, code) => {
        const token = `__CODE_${codeSpans.length}__`;
        const normalizedCode = normalizeCoachMoveToken(code);
        if (isStandaloneMoveToken(normalizedCode)) {
          codeSpans.push(renderCoachMoveToken(normalizedCode));
        } else {
          codeSpans.push(`<code>${escapeHtml(code)}</code>`);
        }
        return token;
      },
    );
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(
      /(^|[\s(>\[{"'“”\u2013\u2014-])((?:0-0-0|0-0|O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?))(?=$|[\s)\].,;:!?'"”’\u2013\u2014-])/gim,
      (_, prefix, move) => `${prefix}${renderCoachMoveToken(move)}`,
    );
    codeSpans.forEach((code, index) => {
      html = html.replace(`__CODE_${index}__`, code);
    });
    return html;
  }

  function isMarkdownTableSeparator(line) {
    const normalized = String(line || "").trim();
    return /^\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?$/.test(normalized);
  }

  function splitMarkdownTableRow(line) {
    return String(line || "")
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
  }

  function renderCoachTable(lines) {
    if (!lines.length) return "";
    const [headerLine, , ...bodyLines] = lines;
    const headers = splitMarkdownTableRow(headerLine);
    const rows = bodyLines
      .map(splitMarkdownTableRow)
      .filter((cells) => cells.some((cell) => cell.length));
    return `<div class="coach-table-wrap"><table class="coach-table"><thead><tr>${headers.map((cell) => `<th>${renderCoachInline(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((cells) => `<tr>${cells.map((cell) => `<td>${renderCoachInline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function renderCoachMarkdown(text) {
    const lines = String(text || "")
      .replace(/\r\n?/g, "\n")
      .split("\n");
    const blocks = [];
    let paragraph = [];
    let list = null;
    let index = 0;
    const flushParagraph = () => {
      if (!paragraph.length) return;
      blocks.push(`<p>${renderCoachInline(paragraph.join(" "))}</p>`);
      paragraph = [];
    };
    const flushList = () => {
      if (!list?.items?.length) return;
      blocks.push(
        `<${list.type}>${list.items.map((item) => `<li>${renderCoachInline(item)}</li>`).join("")}</${list.type}>`,
      );
      list = null;
    };
    while (index < lines.length) {
      const rawLine = lines[index];
      const line = rawLine.trim();
      if (!line) {
        flushParagraph();
        flushList();
        index += 1;
        continue;
      }
      if (
        line.includes("|") &&
        index + 1 < lines.length &&
        isMarkdownTableSeparator(lines[index + 1])
      ) {
        flushParagraph();
        flushList();
        const tableLines = [line, lines[index + 1].trim()];
        index += 2;
        while (index < lines.length) {
          const tableLine = lines[index].trim();
          if (!tableLine || !tableLine.includes("|")) break;
          tableLines.push(tableLine);
          index += 1;
        }
        blocks.push(renderCoachTable(tableLines));
        continue;
      }
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        flushParagraph();
        flushList();
        const level = Math.min(headingMatch[1].length, 4);
        blocks.push(
          `<h${level} class="coach-h${level}">${renderCoachInline(headingMatch[2])}</h${level}>`,
        );
        index += 1;
        continue;
      }
      if (/^(?:---+|\*\*\*+|___+)$/.test(line)) {
        flushParagraph();
        flushList();
        blocks.push(`<hr class="coach-rule">`);
        index += 1;
        continue;
      }
      const bulletMatch = line.match(/^[-*]\s+(.+)$/);
      const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
      if (bulletMatch) {
        flushParagraph();
        if (!list || list.type !== "ul")
          (flushList(), (list = { type: "ul", items: [] }));
        list.items.push(bulletMatch[1]);
        index += 1;
        continue;
      }
      if (orderedMatch) {
        flushParagraph();
        if (!list || list.type !== "ol")
          (flushList(), (list = { type: "ol", items: [] }));
        list.items.push(orderedMatch[1]);
        index += 1;
        continue;
      }
      flushList();
      paragraph.push(line);
      index += 1;
    }
    flushParagraph();
    flushList();
    return blocks.join("") || `<p>${renderCoachInline(text)}</p>`;
  }

  function renderCoachMessageContent(msg) {
    if (msg?.role === "user") return escapeHtml(msg.content);
    return renderCoachMarkdown(msg?.content || "");
  }

  function pushMessage(role, content, extraClass) {
    state.llmMessages.push({ role, content, extraClass });
    if (state.llmMessages.length > 20)
      state.llmMessages = state.llmMessages.slice(-20);
    renderAssistant();
    schedulePersistedBoardStateSave();
  }

  function clampInt(value, min, max, fallback) {
    const n = parseInt(value, 10);
    return Number.isNaN(n) ? fallback : Math.max(min, Math.min(max, n));
  }
  function trimCacheMap(map, maxSize) {
    while (map.size > maxSize) {
      const oldest = map.keys().next();
      if (oldest.done) break;
      map.delete(oldest.value);
    }
  }
  function isEditingElement(element) {
    return (
      !!element &&
      (element.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName))
    );
  }
  function escapeHtml(value) {
    const text = String(value);
    if (!/[&<>"']/.test(text)) return text;
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function clearBrowserSelection() {
    const selection =
      typeof window.getSelection === "function" ? window.getSelection() : null;
    if (selection && selection.rangeCount) selection.removeAllRanges();
  }

})();










