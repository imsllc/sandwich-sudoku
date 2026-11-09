import React from "react";
import { Alert, Linking, Text, View } from "react-native";
import policy from "./data/privacy-policy.json";
import type { Colors } from "./theme";

type Run = { text: string; href?: string };
const open = (url: string) => {
  void Linking.openURL(url).catch(() => Alert.alert("Could not open link", "Please try again when a browser or email app is available."));
};
export function PrivacyPolicy({ colors: c }: { colors: Colors }) {
  const paragraph = (runs: Run[], key: number) => (
    <Text key={key} selectable style={{ color: c.ink, fontSize: 14, lineHeight: 23 }}>
      {runs.map((run, i) => run.href ? (
        <Text key={i} accessibilityRole="link" onPress={() => open(run.href!)}
          style={{ color: c.accent, textDecorationLine: "underline" }}>{run.text}</Text>
      ) : run.text)}
    </Text>
  );
  return (
    <View style={{ gap: 16 }}>
      <Text style={{ color: c.ink, fontWeight: "600" }}>Sandwich Sudoku - Brain Puzzle</Text>
      <Text style={{ color: c.muted }}>Effective date: {policy.date}</Text>
      {policy.intro.map(paragraph)}
      {policy.sections.map(section => (
        <View key={section.title} style={{ gap: 10 }}>
          <Text accessibilityRole="header" style={{ color: c.ink, fontSize: 16, fontWeight: "600" }}>{section.title}</Text>
          {section.paragraphs.map(paragraph)}
        </View>
      ))}
      <Text accessibilityRole="link" onPress={() => open(policy.publicUrl)}
        style={{ color: c.accent, textDecorationLine: "underline", paddingVertical: 12 }}>View privacy policy online</Text>
    </View>
  );
}
