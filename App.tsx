import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useColorScheme,
  useWindowDimensions,
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useKeepAwake } from "expo-keep-awake";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Board } from "./src/Board";
import { Icon, type IconName } from "./src/Icon";
import {
  candidates,
  conflicts,
  completedDigits,
  MAX_NOTES,
  difficulties,
  enterValue,
  type Difficulty,
  type Snapshot,
} from "./src/engine";
import {
  newGame,
  time,
  restoreSavedGame,
  type Game,
  type Stats,
} from "./src/game";
import { themes, type Colors } from "./src/theme";
import { BannerAdSlot, BANNER_HEIGHT, useAds } from "./src/ads";
import { PrivacyPolicy } from "./src/PrivacyPolicy";
import { useBilling } from "./src/billing";

const STORAGE = "@sandwich-sudoku/v1";
type Dialog =
  "settings" | "privacy" | "rules" | "new" | "restart" | "solve" | "hint" | "won" | null;
type Hint = { cell: number; value: number; text: string };
const initialStats: Stats = { wins: 0, best: {} };

export default function App() {
  return (
    <SafeAreaProvider>
      <SandwichApp />
    </SafeAreaProvider>
  );
}

function KeepScreenAwake() {
  useKeepAwake("sandwich-sudoku-screen", { suppressDeactivateWarnings: true });
  return null;
}

const Button = ({
  colors: c,
  title,
  icon,
  onPress,
  primary = false,
  disabled = false,
}: {
  colors: Colors;
  title: string;
  icon?: IconName;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [
      s.button,
      {
        backgroundColor: primary ? c.accent : c.related,
        opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
      },
    ]}
  >
    {icon && <Icon name={icon} color={primary ? c.bg : c.accent} size={19} />}
    <Text
      style={{ color: primary ? c.bg : c.ink, fontWeight: "600", fontSize: 14 }}
    >
      {title}
    </Text>
  </Pressable>
);
const Tool = ({
  colors: c,
  title,
  icon,
  onPress,
  active = false,
  disabled = false,
}: {
  colors: Colors;
  title: string;
  icon: IconName;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={
      title === "Notes" ? `Pencil notes ${active ? "on" : "off"}` : title
    }
    accessibilityState={{ disabled, selected: active }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [
      s.tool,
      {
        backgroundColor: active ? c.accentSoft : c.surface,
        borderColor: active ? c.accent : c.line,
        opacity: disabled ? 0.35 : pressed ? 0.65 : 1,
      },
    ]}
  >
    <Icon name={icon} color={c.accent} />
    <Text style={{ fontSize: 11, fontWeight: "600", color: c.ink }}>
      {title}
    </Text>
    {active && (
      <View
        style={{
          position: "absolute",
          right: 8,
          top: 7,
          width: 5,
          height: 5,
          borderRadius: 3,
          backgroundColor: c.accent,
        }}
      />
    )}
  </Pressable>
);

function SandwichApp() {
  const { width, height } = useWindowDimensions(),
    system = useColorScheme();
  const [game, setGame] = useState<Game>(() => newGame("Easy"));
  const [stats, setStats] = useState<Stats>(initialStats);
  const [theme, setTheme] = useState<"light" | "dark">(
    system === "dark" ? "dark" : "light",
  );
  const [ready, setReady] = useState(false),
    [saveError, setSaveError] = useState(false);
  const [paused, setPaused] = useState(false),
    [foreground, setForeground] = useState(
      AppState.currentState !== "background",
    );
  const [pencil, setPencil] = useState(false),
    [showErrors, setShowErrors] = useState(true);
  const [highlightLines, setHighlightLines] = useState(false);
  const [keepScreenAwake, setKeepScreenAwake] = useState(true);
  const [markCompletedNumbers, setMarkCompletedNumbers] = useState(true);
  const [dialog, setDialog] = useState<Dialog>(null),
    [nextDifficulty, setNextDifficulty] = useState<Difficulty>("Easy");
  const [hint, setHint] = useState<Hint | null>(null);
  const saveQueue = useRef(Promise.resolve());
  const insets = useSafeAreaInsets();
  const billing = useBilling();
  const ads = useAds(ready && billing.ready && !billing.adsRemoved);
  const bannerHeight = billing.adsRemoved ? 0 : BANNER_HEIGHT;
  const c = themes[theme];
  const boardSize = Math.max(
    90,
    Math.floor(
      Math.min(
        520,
        width - 32,
        height - insets.top - insets.bottom - 300 - bannerHeight,
      ),
    ),
  );
  const stopped = paused || !foreground || ads.busy || billing.purchaseInProgress,
    locked = stopped || game.status !== "playing" || !ready;
  const errors = conflicts(game.board, game.puzzle);
  const completedNumbers = completedDigits(game.board);

  useEffect(() => {
    if (Platform.OS !== "web")
      SystemUI.setBackgroundColorAsync(c.bg).catch(() => {});
  }, [c.bg]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw);
        const restoredGame = restoreSavedGame(saved.game);
        if (restoredGame) setGame(restoredGame);
        if (saved.theme === "light" || saved.theme === "dark")
          setTheme(saved.theme);
        if (typeof saved.showErrors === "boolean")
          setShowErrors(saved.showErrors);
        if (typeof saved.highlightLines === "boolean")
          setHighlightLines(saved.highlightLines);
        if (typeof saved.keepScreenAwake === "boolean")
          setKeepScreenAwake(saved.keepScreenAwake);
        if (typeof saved.markCompletedNumbers === "boolean")
          setMarkCompletedNumbers(saved.markCompletedNumbers);
        if (
          saved.stats &&
          Number.isInteger(saved.stats.wins) &&
          saved.stats.wins >= 0 &&
          saved.stats.best &&
          typeof saved.stats.best === "object" &&
          Object.entries(saved.stats.best).every(
            ([d, s]) =>
              difficulties.includes(d as Difficulty) &&
              typeof s === "number" &&
              Number.isFinite(s) &&
              s >= 0,
          )
        )
          setStats(saved.stats);
      })
      .catch(() => setSaveError(true))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    const raw = JSON.stringify({
      game,
      stats,
      theme,
      showErrors,
      highlightLines,
      keepScreenAwake,
      markCompletedNumbers,
    });
    // Serialize writes so an older save cannot overwrite a newer move.
    saveQueue.current = saveQueue.current
      .then(() => AsyncStorage.setItem(STORAGE, raw))
      .then(() => setSaveError(false))
      .catch(() => setSaveError(true));
  }, [
    ready, game, stats, theme, showErrors, highlightLines,
    keepScreenAwake, markCompletedNumbers,
  ]);

  useEffect(() => {
    if (game.status === "won") setDialog("won");
  }, [game.status]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) =>
      setForeground(s === "active"),
    );
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!ready || stopped || dialog || game.status !== "playing") return;
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now(),
        elapsed = Math.floor((now - last) / 1000);
      if (elapsed) {
        last += elapsed * 1000;
        setGame((g) => ({ ...g, seconds: g.seconds + elapsed }));
      }
    }, 500);
    return () => clearInterval(timer);
  }, [ready, stopped, dialog, game.status]);

  const commit = (snapshot: Snapshot, hints = game.hints) => {
    if (snapshot === game) return;
    const won = snapshot.board.every((n, i) => n === game.puzzle.solution[i]);
    setGame({
      ...game,
      ...snapshot,
      hints,
      history: [
        ...game.history.slice(-99),
        { board: game.board, notes: game.notes },
      ],
      status: won ? "won" : "playing",
    });
    if (won) {
      // Only a newly completed game triggers an ad, never a restored win or Solve.
      void ads.showWinInterstitial();
      setStats((s) => ({
        wins: s.wins + 1,
        best: {
          ...s.best,
          [game.puzzle.difficulty]: Math.min(
            s.best[game.puzzle.difficulty] ?? Infinity,
            game.seconds,
          ),
        },
      }));
    }
  };
  const input = (value: number) => {
    if (!locked)
      commit(
        enterValue(
          game,
          game.puzzle.givens,
          game.puzzle,
          game.selected,
          value,
          pencil,
        ),
      );
  };
  const undo = () => {
    if (locked || !game.history.length) return;
    const last = game.history[game.history.length - 1];
    setGame({ ...game, ...last, history: game.history.slice(0, -1) });
  };
  const start = (difficulty: Difficulty) => {
    setGame(newGame(difficulty, game.puzzle.id));
    setPencil(false);
    setPaused(false);
    setDialog(null);
    setHint(null);
  };
  const requestHint = () => {
    if (locked) return;
    const wrong = game.board.findIndex(
      (n, i) => n && n !== game.puzzle.solution[i],
    );
    let cell = wrong,
      text =
        "This entry leads away from the unique solution. Try the value below to get back on track.";
    if (cell < 0) {
      const empties = game.board.flatMap((n, i) => (!n ? [i] : []));
      cell =
        empties.find(
          (i) => candidates(game.board, game.puzzle, i).length === 1,
        ) ?? (game.board[game.selected] === 0 ? game.selected : empties[0]);
      const ns = candidates(game.board, game.puzzle, cell);
      text =
        ns.length === 1
          ? "After checking this row, column, box, and sandwich sums, only one candidate remains."
          : "No single-candidate cell is available. Here is one value from the unique solution to help you move forward.";
    }
    if (cell === undefined || cell < 0) return;
    setGame((g) => ({ ...g, selected: cell }));
    setHint({ cell, value: game.puzzle.solution[cell], text });
    setDialog("hint");
  };

  // Physical keyboard support for web and desktop browsers.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const handler = (e: KeyboardEvent) => {
      if (
        dialog ||
        !ready ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        ["INPUT", "TEXTAREA", "BUTTON"].includes(
          (e.target as HTMLElement)?.tagName,
        )
      )
        return;
      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        input(Number(e.key));
      } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
        e.preventDefault();
        input(0);
      } else if (e.key.toLowerCase() === "n") setPencil((v) => !v);
      else if (e.key.toLowerCase() === "z") undo();
      else if (e.key.startsWith("Arrow") && !stopped) {
        e.preventDefault();
        const offset =
          { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 }[e.key] ??
          0;
        setGame((g) => ({
          ...g,
          selected: Math.max(0, Math.min(80, g.selected + offset)),
        }));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const text = { color: c.ink };
  const close = () => setDialog(null);
  const reset = () => {
    setGame({
      ...game,
      board: [...game.puzzle.givens],
      notes: Array.from({ length: 81 }, () => []),
      seconds: 0,
      history: [],
      hints: 0,
      status: "playing",
    });
    setPaused(false);
    setPencil(false);
    close();
  };
  const confirm = () => {
    if (dialog === "won") start(game.puzzle.difficulty);
    else if (dialog === "new") start(nextDifficulty);
    else if (dialog === "restart") reset();
    else if (dialog === "solve") {
      setGame({
        ...game,
        board: [...game.puzzle.solution],
        notes: Array.from({ length: 81 }, () => []),
        history: [],
        status: "solved",
      });
      close();
    } else if (dialog === "hint" && hint) {
      commit(
        enterValue(
          game,
          game.puzzle.givens,
          game.puzzle,
          hint.cell,
          hint.value,
          false,
        ),
        game.hints + 1,
      );
      setHint(null);
      close();
    } else close();
  };
  const titles = {
    settings: "Settings",
    privacy: "Privacy policy",
    rules: "How to play",
    new: "New game",
    restart: "Restart puzzle?",
    solve: "Reveal solution?",
    hint: "Hint",
    won: "Congratulations!",
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      {ready && foreground && keepScreenAwake && <KeepScreenAwake />}
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <View style={s.screen}>
        <View style={[s.header, { borderBottomColor: c.line }]}>
          <View accessibilityLabel="Sandwich Sudoku - Brain Puzzle">
            <Text style={[s.wordmark, text]}>Sandwich Sudoku</Text>
            <Text style={{ color: c.muted, fontSize: 12, marginTop: 2 }}>
              Brain Puzzle
            </Text>
          </View>
          <View style={[s.row, { gap: 8 }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New game"
              disabled={!ready}
              onPress={() => {
                setNextDifficulty(game.puzzle.difficulty);
                setDialog("new");
              }}
              style={({ pressed }) => [
                s.iconButton,
                {
                  backgroundColor: "#2879E4",
                  borderRadius: 13,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Icon name="plus" color="#FFFFFF" size={26} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Settings"
              onPress={() => setDialog("settings")}
              style={s.iconButton}
            >
              <Icon name="settings" color={c.ink} size={25} />
            </Pressable>
          </View>
        </View>
        <View style={s.playArea}>
          <View style={{ width: boardSize, gap: 14 }}>
            <View
              style={[s.row, { justifyContent: "space-between", height: 32 }]}
            >
              <Text style={{ color: c.muted, fontSize: 14 }}>
                {game.puzzle.difficulty}
              </Text>
              <View style={[s.row, { gap: 12 }]}>
                <Text
                  accessibilityLabel={"Elapsed time " + time(game.seconds)}
                  style={{
                    color: c.ink,
                    fontSize: 16,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {time(game.seconds)}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={paused ? "Resume game" : "Pause game"}
                  disabled={game.status !== "playing" || !ready}
                  onPress={() => setPaused(!paused)}
                  style={{ padding: 8 }}
                >
                  <Icon
                    name={paused ? "play" : "pause"}
                    color={c.ink}
                    size={19}
                  />
                </Pressable>
              </View>
            </View>
            <Board
              game={game}
              size={boardSize}
              colors={c}
              errors={showErrors ? errors : new Set()}
              paused={stopped || !ready}
              highlightLines={highlightLines}
              onSelect={(i) => setGame((g) => ({ ...g, selected: i }))}
            />
            <View style={[s.row, { gap: 5 }]}>
              {Array.from({ length: 9 }, (_, i) => (
                <Pressable
                  key={i}
                  accessibilityRole="button"
                  accessibilityLabel={
                    (pencil ? "Note " : "Enter ") + (i + 1) +
                    (markCompletedNumbers && completedNumbers.has(i + 1)
                      ? ", all nine placed"
                      : "")
                  }
                  disabled={locked || !!game.puzzle.givens[game.selected]}
                  onPress={() => input(i + 1)}
                  style={({ pressed }) => [
                    s.number,
                    {
                      backgroundColor: c.surface,
                      borderColor: c.line,
                      opacity: locked ? 0.4 : pressed ? 0.65 : 1,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: c.accent,
                      fontSize: Math.min(28, boardSize / 13),
                      fontWeight: "500",
                      opacity:
                        markCompletedNumbers && completedNumbers.has(i + 1)
                          ? 0.25
                          : 1,
                    }}
                  >
                    {i + 1}
                  </Text>
                  {markCompletedNumbers && completedNumbers.has(i + 1) && (
                    <View pointerEvents="none" style={s.completedNumber}>
                      <Icon
                        name="check"
                        color={c.accent}
                        size={Math.min(30, boardSize / 12)}
                      />
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
            <View style={[s.row, { gap: 8 }]}>
              <Tool
                colors={c}
                title="Undo"
                icon="undo"
                onPress={undo}
                disabled={locked || !game.history.length}
              />
              <Tool
                colors={c}
                title="Erase"
                icon="erase"
                onPress={() => input(0)}
                disabled={locked || !!game.puzzle.givens[game.selected]}
              />
              <Tool
                colors={c}
                title="Notes"
                icon="pencil"
                active={pencil}
                onPress={() => setPencil(!pencil)}
                disabled={locked}
              />
              <Tool
                colors={c}
                title="Hint"
                icon="hint"
                onPress={requestHint}
                disabled={locked}
              />
            </View>
            <Text
              accessibilityLiveRegion="polite"
              style={{
                color:
                  game.status === "playing" && errors.size && showErrors
                    ? c.error
                    : c.muted,
                textAlign: "center",
                fontSize: 12,
                height: 20,
              }}
            >
              {!ready
                ? "Loading…"
                : game.status === "won"
                  ? "Completed · " +
                    time(game.seconds) +
                    " · " +
                    game.hints +
                    " hints"
                  : game.status === "solved"
                    ? "Solution revealed"
                    : stopped
                      ? "Paused"
                      : showErrors && errors.size
                        ? "Rule conflict"
                        : pencil && game.notes[game.selected].length >= MAX_NOTES
                          ? "4 notes maximum · tap a note again to remove it"
                          : ""}
            </Text>
          </View>
        </View>
      </View>
      {!billing.adsRemoved && (
        <BannerAdSlot
          enabled={ads.canShowBanner && billing.ready}
          background={c.bg}
          border={c.line}
        />
      )}
      <Modal
        visible={dialog !== null}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <View style={[s.modalBackdrop, { backgroundColor: c.overlay }]}>
          <View
            accessibilityViewIsModal
            style={[s.modal, { backgroundColor: c.bg }]}
          >
            <View
              style={[
                s.row,
                { justifyContent: "space-between", marginBottom: 18 },
              ]}
            >
              <Text style={[text, { fontSize: 23, fontWeight: "600" }]}>
                {dialog ? titles[dialog] : ""}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close dialog"
                onPress={close}
                style={s.iconButton}
              >
                <Icon name="close" color={c.muted} />
              </Pressable>
            </View>
            <ScrollView
              key={dialog ?? "closed"}
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ gap: 16 }}
            >
              {dialog === "settings" ? (
                <>
                  {Platform.OS === "android" && (
                    <View style={{ gap: 10 }}>
                      <Button
                        colors={c}
                        title={
                          billing.adsRemoved
                            ? "Ads removed"
                            : billing.price ? "Remove ads · " + billing.price : "Remove ads · price unavailable"
                        }
                        primary
                        disabled={
                          billing.adsRemoved || billing.busy || !billing.ready || !billing.supported || !billing.price
                        }
                        onPress={() => {
                          void billing.buy();
                        }}
                      />
                      <Text style={{ color: c.muted, fontSize: 12 }}>
                        One-time purchase · removes all in-game ads
                      </Text>
                      <Button
                        colors={c}
                        title={
                          billing.busy
                            ? "Connecting to Google Play…"
                            : "Restore purchases"
                        }
                        disabled={
                          billing.busy || !billing.ready || !billing.supported
                        }
                        onPress={() => {
                          void billing.restore();
                        }}
                      />
                      {!!billing.message && (
                        <Text
                          accessibilityLiveRegion="polite"
                          style={{ color: c.ink, fontSize: 13, lineHeight: 19 }}
                        >
                          {billing.message}
                        </Text>
                      )}
                      <View style={{ height: 1, backgroundColor: c.line }} />
                    </View>
                  )}
                  <View
                    style={[
                      s.row,
                      { justifyContent: "space-between", minHeight: 48 },
                    ]}
                  >
                    <Text style={[text, { fontSize: 15 }]}>Show conflicts</Text>
                    <Switch
                      accessibilityLabel="Show conflicts"
                      value={showErrors}
                      onValueChange={setShowErrors}
                      trackColor={{ false: c.line, true: c.accent }}
                      thumbColor={c.surface}
                    />
                  </View>
                  <View
                    style={[
                      s.row,
                      { justifyContent: "space-between", minHeight: 48 },
                    ]}
                  >
                    <Text style={[text, { fontSize: 15 }]}>
                      Highlight row & column
                    </Text>
                    <Switch
                      accessibilityLabel="Highlight row and column"
                      value={highlightLines}
                      onValueChange={setHighlightLines}
                      trackColor={{ false: c.line, true: c.accent }}
                      thumbColor={c.surface}
                    />
                  </View>
                  <View
                    style={[
                      s.row,
                      { justifyContent: "space-between", minHeight: 48 },
                    ]}
                  >
                    <Text style={[text, { fontSize: 15 }]}>Mark completed numbers</Text>
                    <Switch
                      accessibilityLabel="Mark completed numbers"
                      value={markCompletedNumbers}
                      onValueChange={setMarkCompletedNumbers}
                      trackColor={{ false: c.line, true: c.accent }}
                      thumbColor={c.surface}
                    />
                  </View>
                  <View
                    style={[
                      s.row,
                      { justifyContent: "space-between", minHeight: 48 },
                    ]}
                  >
                    <Text style={[text, { fontSize: 15 }]}>Keep screen awake</Text>
                    <Switch
                      accessibilityLabel="Keep screen awake"
                      value={keepScreenAwake}
                      onValueChange={setKeepScreenAwake}
                      trackColor={{ false: c.line, true: c.accent }}
                      thumbColor={c.surface}
                    />
                  </View>
                  <View
                    style={[
                      s.row,
                      { justifyContent: "space-between", minHeight: 48 },
                    ]}
                  >
                    <Text style={[text, { fontSize: 15 }]}>Dark mode</Text>
                    <Switch
                      accessibilityLabel="Dark mode"
                      value={theme === "dark"}
                      onValueChange={(v) => setTheme(v ? "dark" : "light")}
                      trackColor={{ false: c.line, true: c.accent }}
                      thumbColor={c.surface}
                    />
                  </View>
                  <View style={{ height: 1, backgroundColor: c.line }} />
                  <Button
                    colors={c}
                    title="Restart puzzle"
                    icon="restart"
                    disabled={!ready}
                    onPress={() => setDialog("restart")}
                  />
                  <Button
                    colors={c}
                    title="Solve puzzle"
                    icon="solve"
                    disabled={!ready || game.status !== "playing"}
                    onPress={() => setDialog("solve")}
                  />
                  <Button
                    colors={c}
                    title="How to play"
                    icon="help"
                    onPress={() => setDialog("rules")}
                  />
                  <Button colors={c} title="Privacy policy" onPress={() => setDialog("privacy")} />
                  {ads.privacyRequired && (
                    <Button
                      colors={c}
                      title="Ad privacy choices"
                      onPress={() => {
                        void ads.showPrivacyOptions();
                      }}
                    />
                  )}
                  <Text style={{ color: c.muted, fontSize: 12 }}>
                    {stats.wins +
                      " solved" +
                      (stats.best[game.puzzle.difficulty] !== undefined
                        ? " · Best " + time(stats.best[game.puzzle.difficulty]!)
                        : "")}
                  </Text>
                  {saveError && (
                    <Text style={{ color: c.error, fontSize: 12 }}>
                      Progress could not be saved on this device.
                    </Text>
                  )}
                </>
              ) : dialog === "privacy" ? (
                <PrivacyPolicy colors={c} />
              ) : dialog === "won" ? (
                <View
                  style={{ alignItems: "center", gap: 16, paddingVertical: 16 }}
                >
                  <View
                    style={{
                      padding: 18,
                      borderRadius: 40,
                      backgroundColor: c.accentSoft,
                    }}
                  >
                    <Icon name="check" color={c.accent} size={40} />
                  </View>
                  <Text style={[text, { fontSize: 17, textAlign: "center" }]}>
                    You completed the puzzle.
                  </Text>
                  <Text style={{ color: c.muted, fontSize: 14 }}>
                    {game.puzzle.difficulty +
                      " · " +
                      time(game.seconds) +
                      " · " +
                      game.hints +
                      " hints"}
                  </Text>
                </View>
              ) : dialog === "new" ? (
                <>
                  <Text style={{ color: c.muted, lineHeight: 21 }}>
                    Choose difficulty. Starting a new game replaces the current
                    puzzle.
                  </Text>
                  <View style={{ gap: 8 }}>
                    {difficulties.map((d) => (
                      <Pressable
                        key={d}
                        accessibilityRole="button"
                        accessibilityLabel={d + " difficulty"}
                        accessibilityState={{ selected: nextDifficulty === d }}
                        onPress={() => setNextDifficulty(d)}
                        style={[
                          s.difficulty,
                          {
                            backgroundColor:
                              nextDifficulty === d ? c.accentSoft : c.surface,
                            borderColor:
                              nextDifficulty === d ? c.accent : c.line,
                          },
                        ]}
                      >
                        <Text style={[text, { fontSize: 15 }]}>{d}</Text>
                        {nextDifficulty === d && (
                          <Icon name="check" color={c.accent} size={20} />
                        )}
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : dialog === "rules" ? (
                <Text style={{ color: c.ink, fontSize: 15, lineHeight: 25 }}>
                  {
                    "Fill every row, column, and 3 × 3 box with 1–9, once each.\n\nThe 1 and 9 are the crusts. Each outside clue is the sum of the digits strictly between them in that row or column. Either crust may come first. For example, 1 → 2 → 5 → 9 has clue 7.\n\nA clue of 0 means the crusts touch. A clue of 35 places them at opposite ends. Clues 2, 3, or 4 mean exactly one digit sits between the crusts.\n\nSelect a cell, then a number. Notes adds pencil marks. Erase clears the selected cell. Undo restores the previous move.\n\nHints preview one answer before applying it. The timer pauses while you are away or using a menu."
                  }
                </Text>
              ) : dialog === "hint" && hint ? (
                <>
                  <Text
                    style={{ color: c.muted, fontSize: 14, lineHeight: 22 }}
                  >
                    {hint.text}
                  </Text>
                  <View
                    style={{
                      backgroundColor: c.accentSoft,
                      padding: 20,
                      borderRadius: 12,
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Text style={{ color: c.muted }}>
                      {"Row " +
                        (Math.floor(hint.cell / 9) + 1) +
                        " · Column " +
                        ((hint.cell % 9) + 1)}
                    </Text>
                    <Text style={{ fontSize: 40, color: c.accent }}>
                      {hint.value}
                    </Text>
                  </View>
                </>
              ) : (
                <Text style={{ color: c.muted, lineHeight: 23, fontSize: 14 }}>
                  {dialog === "restart"
                    ? "Clear your entries, notes, and timer. The original clues stay in place."
                    : "Fill every cell and end this game. Revealing the solution does not count as a win."}
                </Text>
              )}
            </ScrollView>
            <View style={{ marginTop: 22, gap: 8 }}>
              <Button
                colors={c}
                primary
                title={
                  dialog === "won"
                    ? "New game"
                    : dialog === "settings" || dialog === "rules" || dialog === "privacy"
                      ? "Done"
                      : dialog === "new"
                        ? "Start game"
                        : dialog === "restart"
                          ? "Restart"
                          : dialog === "solve"
                            ? "Reveal solution"
                            : "Apply hint"
                }
                onPress={confirm}
              />
              {dialog !== "settings" &&
                dialog !== "rules" &&
                dialog !== "privacy" &&
                dialog !== "won" && (
                  <Button colors={c} title="Cancel" onPress={close} />
                )}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  completedNumber: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  screen: { flex: 1, alignItems: "center", paddingHorizontal: 16 },
  row: { flexDirection: "row", alignItems: "center" },
  header: {
    height: 64,
    width: "100%",
    maxWidth: 560,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  wordmark: { fontSize: 20, fontWeight: "600", letterSpacing: -0.5 },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  playArea: { flex: 1, justifyContent: "center", alignItems: "center" },
  number: {
    flex: 1,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
  },
  tool: {
    flex: 1,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  button: {
    minHeight: 48,
    paddingHorizontal: 17,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  difficulty: {
    minHeight: 48,
    padding: 14,
    borderWidth: 1,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 22,
  },
  modal: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "90%",
    padding: 24,
    borderRadius: 22,
  },
});
