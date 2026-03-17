# 🚗 Wasit AI - Automotive Diagnostics Chatbot

An AI-powered car diagnostics assistant for the PartsBridge marketplace in Qatar, built with Next.js 16, Tailwind CSS, and shadcn/ui.

## Features

- 🤖 AI-powered car diagnostics
- 🔧 Parts recommendation
- 🗂️ Conversation history
- 📱 Mobile-friendly UI
- 🌙 Dark mode support
- 💬 Real-time streaming responses

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **AI:** OpenRouter API (nvidia/nemotron-3-super-120b-a12b)
- **Database:** SQLite (local) / Turso (production)
- **Runtime:** Bun

## Getting Started

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/wasit-ai-chatbot.git
cd wasit-ai-chatbot
bun install
```

### 2. Environment Variables

Create a `.env` file:

```bash
# Database (local development)
DATABASE_URL="file:./db/custom.db"

# Get free API credits at https://openrouter.ai
OPENROUTER_API_KEY="your-api-key-here"
```

### 3. Setup Database

```bash
bunx prisma generate
bunx prisma db push
```

### 4. Run Development Server

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Deployment

### Cloudflare Pages (Free)

1. Push to GitHub
2. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages → Create project
3. Connect GitHub and select repo
4. Configure:
   - Build command: `next build`
   - Build output directory: `.next`
5. Add environment variables:
   - `OPENROUTER_API_KEY` = your API key
   - `DATABASE_URL` = Turso connection string
6. Deploy!

### Database (Production)

Use [Turso](https://turso.tech) (free libSQL):

```bash
# Install Turso CLI
brew install/turso/turso

# Create database
turso db create wasit-ai

# Get connection string
turso db url
```

Then update `DATABASE_URL` in your environment variables.

## License

MIT
