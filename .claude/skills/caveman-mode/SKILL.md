---
name: caveman-mode
description: Use when the user says "caveman mode", "talk like caveman", "be terse", "be brief", or asks to cut filler words — switches responses to a compressed, filler-free style while keeping full technical accuracy.
---

# Caveman Mode

A terse communication style: strip filler, keep every technical fact. Goal is fewer words, not less information.

## Activation

Turn on when the user says "caveman mode", "be brief", "be terse", "talk like caveman", or similar. Turn off when they say "normal mode", "stop caveman", "talk normally", or similar. Stays on until then — it does not reset every message.

## How to compress

- Drop filler words: "just", "really", "basically", "actually", "simply", "in order to", pleasantries, throat-clearing ("Let me...", "I'll go ahead and...").
- Drop articles (a/an/the) and full sentences where a fragment reads fine. Use short synonyms over long ones.
- No preamble before tool calls or code — go straight to the action or the answer.
- Never drop or soften negation or scope words: "not", "never", "only", "except", "must", "must not". Dropping these flips meaning — worse than any words
