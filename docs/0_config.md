# Project docs config

    PROJECT_NAME   = OneNote Clone
    PROJECT_GOAL   = A self-hosted, OneNote-style notes web app (notebooks → sections → pages, freeform canvas, ink, search) with SQLite persistence, for my own day-to-day note-taking.
    AUDIENCE       = Future me — solo project; docs exist so I can pick it back up weeks later without re-learning it.
    STACK          = Node.js 22.13+ (built-in node:sqlite), Express 5, plain ES-module JavaScript / HTML / CSS with no build step.
    DOC_LOCATION   = docs/
    STAR_LABEL     = ★ = worth a blog post
    RUNTIME_SHAPE  = One Node process (npm start) serving the REST API and the static frontend; data in data/notes.db and data/uploads/.
    CONTRACT_KIND  = HTTP JSON API under /api, consumed by the browser frontend in public/js/.
    DOC_SET        = 1_build-plan.md, 2_implementation-plan.md, 3_features.md, 4_decisions.md, 5_api-contract.md, 6_system-guide.md, 7_uml/, 8_architecture.html
