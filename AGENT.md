# AGENTS.md

# Game Engineering Guidelines

## Goal

This project prioritizes:

- Gameplay stability
- Simplicity
- Readability
- Performance
- Low bug risk

Fancy architecture is NOT a goal.

---

# Core Principles

Always follow:

1. Keep gameplay behavior unchanged unless requested.
2. Simplicity over architecture.
3. Readability over abstraction.
4. Stability over cleverness.
5. KISS.
6. YAGNI.

---

# Scope Rules

Only modify code related to the requested task.

Do not reorganize the project unnecessarily.

Avoid opportunistic refactoring.

---

# Architecture

Avoid:

- unnecessary managers
- unnecessary state machines
- generic utilities
- wrapper functions
- deep inheritance
- over-engineered component systems

If code is used only once, keep it local.

---

# Phaser

Prefer Phaser's built-in APIs.

Avoid reinventing existing engine features.

Keep Scene logic easy to follow.

Avoid splitting one gameplay feature across many files.

---

# Performance

Prioritize smooth gameplay.

Avoid unnecessary allocations inside update().

Avoid creating temporary objects every frame.

Avoid unnecessary timers.

Measure before optimizing.

---

# Game Logic

Gameplay logic should be explicit.

Avoid hiding gameplay rules behind generic utilities.

A developer should understand gameplay by reading the Scene.

---

# Assets

Reuse assets when possible.

Do not duplicate assets.

Keep asset loading organized.

---

# UI

Keep UI code simple.

Avoid unnecessary abstraction.

---

# Debugging

Prefer simple debugging.

Avoid adding complex debugging systems.

Remove temporary debugging code before finishing.

---

# Code Style

Prefer:

Early return.

Small methods.

Readable logic.

Clear naming.

Avoid clever tricks.

---

# Before Adding Code

Ask:

Can this feature be implemented using existing code?

Can code be removed instead?

Can complexity be reduced?

---

# Before Finishing

Verify:

✓ Gameplay is unchanged.
✓ Performance is not worse.
✓ No unnecessary abstraction added.
✓ No unnecessary files created.
✓ No dead code.
✓ Easy to understand.
✓ Low maintenance cost.
