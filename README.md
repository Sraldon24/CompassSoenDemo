# 🧭 SOEN Compass

> **Plan your Software Engineering degree the smart way.**

An AI-powered degree planner for **Concordia BEng Software Engineering** students. Drag-and-drop term planning, AI chatbot, interactive prerequisite map, and community insights — all free, all open source.

[![Live Demo](https://img.shields.io/badge/demo-live-success)](https://soen-compass.up.railway.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![Tailwind](https://img.shields.io/badge/Tailwind-v4-38B2AC)](https://tailwindcss.com/)

> ⚠️ **This is a draft README.** Claude Code will polish it with real screenshots, demo links, and final copy after MVP.

---

## ✨ Features

- 📅 **Drag-and-drop term planner** — Build your 4-year plan visually
- 🤖 **Ask Compass AI chatbot** — Natural-language Q&A with RAG over Concordia data + community insights
- 🗺️ **Interactive prerequisite map** — D3.js force-directed graph
- 🔍 **Semantic search** — Find courses by meaning, not just keywords
- 📊 **Real-time plan validation** — Detect prereq violations instantly
- ⚖️ **Workload predictor** — Avoid burnout terms with statistical workload analysis
- 📝 **Email templates** — Pre-drafted emails to advisors with AI assistance
- 👤 **Public profiles** — LinkedIn-style sharing for networking
- 💬 **Community ratings** — Course difficulty votes + professor reviews
- 📤 **Export anywhere** — PDF + .ics (calendar) export
- 🌗 **Dark mode** — Beautiful in both themes
- 📱 **Mobile responsive** — Works on every device

---

## 🚀 Quick Start

### Prerequisites

- Node.js 22+ (LTS)
- PostgreSQL 16+ with pgvector extension
- A free [Groq API key](https://console.groq.com/keys)
- A free [Google AI Studio key](https://aistudio.google.com/app/apikey) (Gemini fallback)
- A [Google OAuth client](https://console.cloud.google.com/) (for sign-in)

### Setup

```bash
# Clone the repo
git clone https://github.com/amirghadimi/soen-compass.git
cd soen-compass

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Fill in your .env with credentials (see .env.example)

# Set up the database
npm run db:migrate
npm run db:seed

# Start development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

### Deploy to Railway

1. Create a [Railway](https://railway.app) account
2. New Project → Deploy from GitHub repo
3. Add a Postgres service (auto-provisions)
4. Set env vars (see `.env.example`)
5. Run migrations once via Railway console
6. Done — auto-deploys on every push to `main`

See [docs/deployment.md](docs/deployment.md) for detailed deployment guide.

---

## 🏗️ Tech Stack

| Category | Tools |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS v4, shadcn/ui |
| Backend | Next.js Route Handlers + Server Actions, Drizzle ORM |
| Database | PostgreSQL 16 + pgvector |
| Auth | Better Auth (Google OAuth) |
| AI | Groq (Llama 3.1 8B + 3.3 70B), Gemini 2.0 Flash, sentence-transformers |
| Scraping | Crawlee, Playwright, Cheerio |
| Observability | Sentry, PostHog |
| Hosting | Railway |

**Total cost: $0/month** (all free tiers).

See [ARCHITECTURE.md](ARCHITECTURE.md) for technical deep dive.

---

## 📂 Project Structure

```
soen-compass/
├── app/                  # Next.js App Router pages
│   ├── (auth)/           # Login, onboarding
│   ├── (dashboard)/      # Protected app pages
│   ├── u/[slug]/         # Public profiles
│   └── api/              # API routes
├── components/           # React components
│   ├── ui/               # shadcn/ui primitives
│   └── ...               # Custom components
├── lib/                  # Shared logic
│   ├── db/               # Drizzle schema + client
│   ├── ai/               # AI provider, RAG, embeddings
│   ├── validation/       # Plan validation rules
│   └── ...
├── data/                 # Seed data (courses, deadlines)
├── scripts/              # Build/seed/scrape scripts
└── tests/                # Vitest + Playwright tests
```

---

## 🧪 Testing

```bash
npm run test          # Unit + component tests (Vitest)
npm run test:e2e      # E2E tests (Playwright)
npm run test:watch    # Watch mode
```

---

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Quick contribution flow

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make changes following [CLAUDE.md](CLAUDE.md) conventions
4. Run tests: `npm run test`
5. Commit using Conventional Commits: `git commit -m "feat: add my feature"`
6. Push and open a PR

---

## 📜 License

[MIT](LICENSE) © 2026 Amirhossein Ghadimi

You can use this code freely. If you build something with it, a star ⭐ is appreciated but not required.

---

## 🙏 Acknowledgments

- **Concordia University** for the academic resources this tool helps navigate
- **airi-14x** for the [Concordia Master Guide](https://airi-14x.github.io/Concordia-Master-Guide/) that inspired ENCS tips section
- **stumash** for [ConU Course Planner](https://github.com/stumash/CoursePlanner) providing structured prereq data
- **r/Concordia** community for course insights and real student perspectives
- **shadcn** for the incredible component library
- **Vercel** for Next.js + Geist fonts
- **Anthropic** (Claude Code) for AI pair programming

---

## 📬 Contact

- **Issues / bugs:** [GitHub Issues](https://github.com/amirghadimi/soen-compass/issues)
- **Discussions:** [GitHub Discussions](https://github.com/amirghadimi/soen-compass/discussions)
- **Author:** Amir Ghadimi — [LinkedIn](https://linkedin.com/in/) (TBD)

---

## ⚠️ Disclaimer

SOEN Compass is **not affiliated with or endorsed by Concordia University**. Course information is scraped from publicly available Concordia resources. Always verify with your academic advisor before making registration decisions. The accuracy of community-submitted ratings and AI responses is not guaranteed.

---

**Built with ☕ and 🤖 by a Concordia SOEN student, for Concordia SOEN students.**
