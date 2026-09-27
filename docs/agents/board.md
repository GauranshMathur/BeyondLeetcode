# Board: planned work

Planned work lives as **cards** on the GitHub Project board **BeyondLeetcode UI — MVP1**: https://github.com/users/GauranshMathur/projects/1

Cards are draft items on the board, never repo issues. GitHub Issues stay for incoming requests (content enhancements, bugs); see `issue-tracker.md`.

A card title reads `[CODE] Area: what`. The code prefix names the canvas page: `F` Foundations, `P` Practice, `R` Reading, `A` Auth, `AD` Admin, `AC` Account, `S` System.

## Board IDs

| What | Value |
|---|---|
| Project number / owner | `1` / `GauranshMathur` |
| Project ID | `PVT_kwHOAm0pms4Bk1LB` |
| Status field ID | `PVTSSF_lAHOAm0pms4Bk1LBzhjkTMw` |
| Todo / In Progress / Done | `f75ad846` / `47fc9ee4` / `98236657` |

```bash
# Todo cards
gh project item-list 1 --owner GauranshMathur --limit 200 --format json \
  --jq '.items[] | select(.status=="Todo") | {id, title, body: .content.body}'

# Move a card (swap in the option ID for the target column)
gh project item-edit --project-id PVT_kwHOAm0pms4Bk1LB --id <item-id> \
  --field-id PVTSSF_lAHOAm0pms4Bk1LBzhjkTMw --single-select-option-id <option-id>

# New card: create it, then move it to Todo
gh project item-create 1 --owner GauranshMathur --title "[CODE] Area: what" --body "..."
```

## Working cards

You are the orchestrator; subagents do the cards.

1. **Pick.** Choose cards from Todo and sort them into **lanes**: cards that edit the same file share a lane and run in order; different files mean different lanes. `F` cards all edit Foundations, so they form one lane, and they run in an earlier round than any card that uses the patterns they add. Done when every picked card sits in exactly one lane.
2. **Claim.** Move every picked card to In Progress. Done when the board shows each one In Progress.
3. **Dispatch.** One subagent per lane, every lane in a single message so they run in parallel. Each brief carries the card title and body, the files the lane owns, and the lane rules below. Done when every lane has reported back.
4. **Integrate.** Only you edit `project/canvas.json`: re-read it from the canvas, add entries for any new artboards the lanes created, rewrite each touched page's STATUS sticky, publish. Done when every new artboard appears on its page and each STATUS sticky lists only cards still open.
5. **Close.** Move each finished card to Done. A card a lane could not finish stays In Progress, and you tell the user what blocked it. Done when the board matches the canvas.

## Lane rules (design cards)

- Canvas: https://claude.ai/artifact/WRJr84ccDYXAd3Yg1Xvp1d. Read each file you will change from the canvas before editing it.
- Edit only the `.dc.html` files your lane owns. Leave `canvas.json` to the orchestrator; report any new artboard's file name, width and height instead.
- A pattern the Foundations page lacks goes to the orchestrator as a new `F` card rather than being invented on a board.
- Every artboard works in light and dark: colors come from the file's `tokens()` function, and a new artboard ships with its `-dark` wrapper file.
- Content stays placeholder, in `[brackets]`.
- Publish only the files you changed. If a publish is refused because someone saved meanwhile, re-read those files and redo the edit once.
