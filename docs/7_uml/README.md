# 7_uml: the system in diagrams

Mermaid sources, rendered on GitHub and in VS Code's Markdown preview. The same diagrams, with a
hand-drawn master diagram on top, are in [../8_architecture.html](../8_architecture.html). When the
two disagree, these files are right. The prose companion is [../6_system-guide.md](../6_system-guide.md).

**The one fact to know before opening any of them:** the server never looks inside a page. A
page's whole canvas (containers, HTML, ink) is a single JSON string that the browser builds, sends
and parses. Every diagram that touches pages follows from that.

| Question | Diagram | File |
|---|---|---|
| What is this, and what does it talk to? | Context | [7.1_hld.md](7.1_hld.md) |
| What processes and files are there, and where do they run? | Containers, deployment (incl. PLANNED remote access) | [7.1_hld.md](7.1_hld.md) |
| What are the frontend modules and how do they talk? | Components | [7.2_lld.md](7.2_lld.md) |
| What does `PageEditor` hold and expose? | Class | [7.2_lld.md](7.2_lld.md) |
| What is stored, and what is inside `pages.content`? | ER, payload shape | [7.3_data-model.md](7.3_data-model.md) |
| What happens, in order, when I type / open a link / insert a picture / delete a page? | Sequences | [7.4_sequences.md](7.4_sequences.md) |
| What states can the save indicator, a page, and the editor's tool be in? | State machines | [7.5_state-machines.md](7.5_state-machines.md) |
| Where does the logic branch: save or skip, new container or not, how a paste is treated? | Activity | [7.6_activity.md](7.6_activity.md) |

**After changing any diagram here, run `npm run docs:arch`** to regenerate
`8_architecture.html` (`scripts/build-architecture.mjs`), then open it and look at it. Never edit
the HTML by hand.

Conventions: labels on branches and transitions are the literal values in the code (`'saved'`,
`'eraser'`, `deleted_at IS NULL`). Dashed elements are **not built**.
