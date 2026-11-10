# Contigo · Casa Contigo

**We protect extraordinary girls and adolescents and accompany their caregivers.** Contigo ("With you") gives mothers, grandmothers and teachers in Colombia practical tools, tips and information to support girls and adolescents on the autism spectrum or with another neurodivergence, and to care for their own wellbeing. **We don't diagnose, we don't prescribe, we don't generalize.** Built by Pulso Mundo and [Smart4AI](https://smart4ai.io) for the UNICEF Femtech Ventures 2026 call (Pillar 3: mental wellbeing, safety and protection).

Live prototype (Spanish): https://acompanante-cuidadora-36zn.vercel.app · Casa Contigo: https://acompanante-cuidadora-36zn.vercel.app/casa-contigo.html

## What it does
1. **Starts from a sensory profile.** Every girl and adolescent is different. Before advising, Contigo asks for a 4-minute sensory profile of the caregiver and of the girl or adolescent (what overwhelms, what regulates, warning signs). The profile is stored only on the caregiver's phone and travels with each message. The server never stores it.
2. **A Spanish chat that answers from that profile**, using a curated knowledge base with citations: developmental signs to discuss with the specialist, the Colombian health route, caregiver wellbeing.
3. **Cares for the caregiver**: a brief PHQ-2 / GAD-2 check-in, self-care content and a crisis protocol with Colombian helplines (106, 123, 141).
4. **Sensory tools that work without an account**: "Why is she extraordinarily unique?", the energy "glass", "This is how I am", my day, calm corner, storm plan, social stories, EPS route guide, and **"Her cycles, her rhythm"**, a cycle and puberty tracker that finds sensory and mood patterns.
5. **Casa Contigo**: a virtual wellbeing house with rooms (sensory integration, wellbeing refuge, library, safe place, cycles, kitchen, cinema; experts, inspiration and garden on the roadmap).

## How it works (safety by design)
Every message goes through a fixed pipeline:

1. **Crisis lock** (fixed rules, no AI): suicide-risk language → helplines 106 / 123.
2. **Abuse lock** (fixed rules, no AI): signs of abuse of a girl, boy or adolescent → ICBF 141 + 123.
3. **Profile gate**: without a sensory profile, Contigo does not give general advice; it invites the caregiver to complete it. Crisis and abuse locks never wait for the profile.
4. **Librarian**: retrieval over a curated, licensed knowledge base (17 documents, `biblioteca.json`).
5. **Model**: answers as a warm expert from the profile, which is passed as delimited data, never as instructions.
6. **Diagnosis filter**: blocks any statement on whether a girl or adolescent is on the autism spectrum or presents another neurodivergence, as well as probabilities or scores.
7. **Citation verifier**: blocks invented sources and uncited Colombian facts.

The server stores no conversations and no profiles: the session lives in the user's browser. Rate limits: 40 messages/hour per session, 120 per IP (crisis messages always pass).

## Model-agnostic
`src/modelo.js` is the only file that talks to an LLM. Today: Claude Sonnet via Vercel AI Gateway (OIDC, no API key in the repo). Open-weights models are planned.

## Run locally
```bash
npm install
npm run biblioteca      # builds biblioteca.json from the knowledge base (if present)
npm test                # acceptance tests (SIN_BANCO=1 skips the paid precision bank)
npm run web             # local web server at http://127.0.0.1:3000
```

## Tests
- `pruebas/ca.test.js`: acceptance criteria (crisis, abuse, diagnosis filter, profile, citations, retrieval, check-in).
- `pruebas/api.test.js`: web API (validation, limits, profile privacy, prompt-injection inside the profile).
- `pruebas/recursos*.test.js`, `pruebas/casa-y-ciclos.test.js`: the tools and Casa Contigo.
- Precision bank: 30 caregiver questions; 0 critical fabrications in every run.

## Status
Functional prototype (2026-11-10). Next milestones: validation of evidence and experience with Integrar, ethics review, WhatsApp/voice channel and a pilot with caregivers.

## Licence
Code: MIT. Project-authored content: CC BY 4.0. See `LICENSE`.
