# First message for Claude Code

**Before you paste:** put `morada-build-pack.zip` in the root folder of the Morada project (drag it in with Finder/Explorer, or drop it into the Claude Code chat). That's all you need to do; Claude handles the rest.

Copy everything inside the box below and paste it as your first message.

---

```
I'm Jed. I own Morada and I don't use the terminal, so please run any commands yourself and explain things to me in plain English.

We've finished a full visual redesign of the app in Figma and I've approved every screen. I want you to build it so it looks exactly like the designs, without breaking anything that works today.

1. SET UP THE DESIGN PACK
   - The file morada-build-pack.zip is in the project root (or attached here). Unzip it into a folder called /design at the repo root, so you have /design/BUILD-SPEC.md, /design/COMPONENTS.md, /design/BUILD-ORDER.md, /design/GOTCHAS.md, /design/tokens/theme.ts, /design/screens/*.png and /design/reference/*.
   - Commit /design on its own ("Add design build pack") before changing any app code.
   - Delete the zip once it's unpacked.

2. READ EVERYTHING FIRST
   Read these files in full before writing any code: /design/BUILD-SPEC.md, /design/COMPONENTS.md, /design/BUILD-ORDER.md, /design/GOTCHAS.md and /design/tokens/theme.ts. Look at the PNGs in /design/screens. They are the approved designs. /design/reference/figma-layout-dump.txt has exact measurements for every frame if you need a number that isn't in the spec.

3. FIGMA (OPTIONAL BUT HELPFUL)
   The Figma file is https://www.figma.com/design/purB3wnrQmpAgjBmG4fQiP (page "Revamp"). Each screen in BUILD-SPEC.md has its own node link. If the Figma MCP server is available to you, use it to check details against the frames. If it isn't connected, tell me the exact steps to connect it (what to click or paste) and carry on with the PNGs and the spec. They're enough to build from. Ignore the Figma *variables*. They're an old palette (see GOTCHAS #6).

4. HOW TO WORK
   - Follow /design/BUILD-ORDER.md phase by phase. Start with Phase 0 (look through the codebase and send me a plan in plain English: which files you'll change for each screen). Don't change code until I say go.
   - This is a presentation-only change. Keep all existing data, API calls, navigation and logic exactly as they are. Only change how things look.
   - Build the shared components first and reuse them everywhere. Never hardcode colours, font sizes or spacing. Always use the theme.
   - Everything in the designs is dummy data. Never copy names, prices or counts from the PNGs into the code.
   - Stop after each screen. Tell me what you changed, where to find it in the app, and anything you weren't sure about. Then wait for me to approve it or give feedback before you move on.
   - Commit after each component group and after each screen so we can roll back a single screen if needed.
   - If something in the design can't work with our real data, ask me. Don't guess.

Please start now with step 1 (set up the design pack), then Phase 0.
```

---

### Later: useful follow-up messages
- "Approved, go to the next screen."
- "On [screen], the [thing] doesn't match the PNG: [what's wrong]. Compare against /design/screens/[file].png and fix it."
- "Show me the list of screens done and still to do, from BUILD-ORDER.md."
- "We're on Phase 5 now: build the Duo/unfolded layouts. Same rules, stop after each screen."
