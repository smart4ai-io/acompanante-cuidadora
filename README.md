# Acompañante de la cuidadora · Caregiver's Companion

**A warm, expert conversational companion for mothers and grandmothers of autistic girls in Colombia.** It accompanies and guides; it never diagnoses, never prescribes. Built by [Smart4AI](https://smart4ai.io) with Pulso Mundo for the UNICEF Femtech Ventures 2026 call (Pillar 3: mental wellbeing, safety and protection).

Live pilot (Spanish): https://acompanante-cuidadora-36zn.vercel.app

## What it does
1. **Cares for the caregiver**: brief PHQ-2 / GAD-2 check-in (PHQ-9 / GAD-7 if high), self-care content, crisis protocol with Colombian hotlines (106, 123) and a human on-call alert.
2. **Helps see the girl in time, without diagnosing**: CDC developmental milestones (with attribution), female-presentation signs framed as "things to discuss with the paediatrician", an observation diary and a summary for the medical visit.
3. **Navigates the Colombian health route**: what to ask the EPS, how to escalate (written denial, petition, Supersalud), when a *tutela* applies, ICBF line 141 for child protection.

## How it works (safety by design)
Every message goes through a fixed pipeline:

1. **Crisis lock** (rules, no LLM): suicide-risk language → hotlines 106 / 123 + on-call alert.
2. **Abuse lock** (rules, no LLM): child-abuse language → ICBF 141 + 123 + on-call alert.
3. **Librarian**: lexical retrieval over a curated, licensed knowledge base (16 documents, `biblioteca.json`).
4. **Model**: the LLM answers as a warm expert; Colombian legal/procedural facts and instrument scores only with a citation `[fuente: id]`.
5. **Diagnosis filter**: blocks any "has / doesn't have autism", probabilities or scores; one retry, then a fixed safe answer.
6. **Citation verifier**: blocks invented sources and uncited legal facts.

The server stores no conversations: the session lives in the user's browser and travels with each request. Rate limits: 40 messages/hour per session, 120 per IP (crisis messages always pass).

## Model-agnostic
`src/modelo.js` is the only file that talks to an LLM (`completar({system, mensajes})`). Today: Claude Sonnet via Vercel AI Gateway (OIDC, no API key in the repo). Providers: `gateway`, `anthropic`, `manual` (offline test mode). Open-weights models are planned (acceptance criterion CA6).

## Run locally
```bash
npm install
npm run biblioteca      # builds biblioteca.json from the knowledge base (if present)
npm test                # acceptance tests (SIN_BANCO=1 skips the paid precision bank)
npm run chat            # terminal chat
npm run web             # local web server at http://127.0.0.1:3000
```
Model credentials go in `.env.local` (never committed): `AI_GATEWAY_API_KEY` or `SMART_ROUTER_ANTHROPIC_KEY`. Without a key, tests that need the model run in manual mode or are skipped.

## Tests
- `pruebas/ca.test.js`: acceptance criteria CA1-CA13 (crisis, abuse, diagnosis filter, citations, retrieval, check-in, diary, conversation).
- `pruebas/api.test.js`: web API (validation, limits, state, guardia).
- Precision bank: 30 caregiver questions with expected sources and forbidden phrases; 0 critical fabrications in every run.

## Status
Functional prototype (v2, 2026-11-02). Clinical validation, ethics review, WhatsApp/voice channel and the caregiver pilot are the next milestones. See `LEEME.md` (Spanish) for details.

## Licence
Code: MIT. Project-authored content: CC BY 4.0. See `LICENSE`.
