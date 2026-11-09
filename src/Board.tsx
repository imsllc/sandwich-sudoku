import React from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import Svg, { Line } from "react-native-svg";
import type { Game } from "./game";
import type { Colors } from "./theme";
import { MAX_NOTES } from "./engine";

export function Board({
  game,
  size,
  colors: c,
  errors,
  paused,
  onSelect,
  highlightLines = false,
}: {
  game: Game;
  size: number;
  colors: Colors;
  errors: Set<number>;
  paused: boolean;
  onSelect: (i: number) => void;
  highlightLines?: boolean;
}) {
  const gutter = size / 12;
  const gridSize = size - gutter;
  const cell = gridSize / 9;
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: c.surface,
        borderRadius: 4,
        overflow: "hidden",
      }}
      accessibilityLabel="Sandwich Sudoku board"
    >
      {!paused && (
        <>
          {game.puzzle.colSums.map((sum, i) => (
            <Text key={"col" + i} accessibilityLabel={`Column ${i + 1} sandwich sum ${sum}`}
              style={{position: "absolute", left: gutter + i * cell, top: 0, width: cell, height: gutter,
                textAlign: "center", lineHeight: gutter, fontSize: cell * 0.36, fontWeight: "700", color: c.accent}}>{sum}</Text>
          ))}
          {game.puzzle.rowSums.map((sum, i) => (
            <Text key={"row" + i} accessibilityLabel={`Row ${i + 1} sandwich sum ${sum}`}
              style={{position: "absolute", left: 0, top: gutter + i * cell, width: gutter, height: cell,
                textAlign: "center", lineHeight: cell, fontSize: cell * 0.36, fontWeight: "700", color: c.accent}}>{sum}</Text>
          ))}
          <View style={{position: "absolute", left: gutter, top: gutter, width: gridSize, height: gridSize}}> 
            {game.board.map((n, i) => (
              <View
                key={i}
                style={{
                  position: "absolute",
                  left: (i % 9) * cell,
                  top: Math.floor(i / 9) * cell,
                  width: cell,
                  height: cell,
                  backgroundColor: errors.has(i)
                    ? c.errorBg
                    : i === game.selected
                      ? c.selected
                      : highlightLines &&
                          (Math.floor(i / 9) ===
                            Math.floor(game.selected / 9) ||
                            i % 9 === game.selected % 9)
                        ? c.related
                        : "transparent",
                }}
              />
            ))}
          </View>
          <Svg
            width={gridSize}
            height={gridSize}
            viewBox="0 0 900 900"
            style={{position: "absolute", left: gutter, top: gutter}}
            pointerEvents="none"
          >
            {Array.from({ length: 10 }, (_, i) => (
              <React.Fragment key={i}>
                <Line
                  x1={i * 100}
                  y1="0"
                  x2={i * 100}
                  y2="900"
                  stroke={i % 3 ? c.line : c.major}
                  strokeWidth={i % 3 ? 1.5 : 4}
                />
                <Line
                  y1={i * 100}
                  x1="0"
                  y2={i * 100}
                  x2="900"
                  stroke={i % 3 ? c.line : c.major}
                  strokeWidth={i % 3 ? 1.5 : 4}
                />
              </React.Fragment>
            ))}
          </Svg>
          {game.board.map((n, i) => (
            <Pressable
              key={i}
              onPress={() => onSelect(i)}
              accessibilityRole="button"
              accessibilityLabel={`Row ${Math.floor(i / 9) + 1}, column ${(i % 9) + 1}, ${n || "empty"}${game.puzzle.givens[i] ? ", given" : ""}${errors.has(i) ? ", conflict" : ""}`}
              accessibilityState={{ selected: game.selected === i }}
              style={({ pressed }) => ({
                position: "absolute",
                left: gutter + (i % 9) * cell,
                top: gutter + Math.floor(i / 9) * cell,
                width: cell,
                height: cell,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.65 : 1,
                borderWidth: game.selected === i ? 2 : 0,
                borderColor: c.accent,
              })}
            >
              {n ? (
                <Text
                  style={{
                    color: errors.has(i)
                      ? c.error
                      : game.puzzle.givens[i]
                        ? c.ink
                        : c.accent,
                    fontSize: cell * 0.53,
                    fontWeight: game.puzzle.givens[i] ? "600" : "400",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {n}
                </Text>
              ) : (
                <View
                  style={{
                    width: cell * 0.88,
                    height: cell * 0.88,
                  }}
                >
                  {game.notes[i].slice(0, MAX_NOTES).map((digit, k) => (
                    <Text
                      key={digit}
                      style={{
                        position: "absolute",
                        left: k === 0 || k === 3 ? 0 : undefined,
                        right: k === 1 || k === 2 ? 0 : undefined,
                        top: k < 2 ? 0 : undefined,
                        bottom: k >= 2 ? 0 : undefined,
                        width: "40%",
                        height: "40%",
                        textAlign: "center",
                        fontSize: cell * 0.27,
                        color: c.ink,
                        lineHeight: cell * 0.35,
                        includeFontPadding: false,
                      }}
                    >
                      {digit}
                    </Text>
                  ))}
                </View>
              )}
            </Pressable>
          ))}
        </>
      )}
      {paused && (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <Text style={{ fontSize: 30, color: c.accent }}>Ⅱ</Text>
          <Text style={{ fontSize: 20, color: c.ink, fontWeight: "600" }}>
            Paused
          </Text>
        </View>
      )}
    </View>
  );
}
