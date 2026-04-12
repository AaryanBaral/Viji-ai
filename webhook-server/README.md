# Vehicle Parts WhatsApp Chatbot

AI-powered WhatsApp chatbot for vehicle spare parts distribution with grade-based discounts (25%-40%).

## Features

- 🤖 Intelligent chatbot (Botpress + Claude AI)
- 🌍 Bilingual support (English & Nepali)
- 👤 Customer recognition by phone/code
- 🔍 Smart product search (by name, vehicle, category)
- 💰 Automatic grade-based discounts (LEO 40%, HRS 37%, CAT 35%, TORT 33.5%, PUBLIC 25%)
- 📍 Nearby workshop finder (GPS-based)
- 🛒 Shopping cart & order placement
- 📦 Order status tracking

## Tech Stack

- **Database:** Supabase (PostgreSQL)
- **Chatbot:** Botpress Cloud
- **AI:** Claude API (Anthropic)
- **Messaging:** WhatsApp Business API (360Dialog)
- **Version Control:** GitHub

## Quick Start

See [docs/setup/01-github-setup.md](docs/setup/01-github-setup.md) for detailed instructions.

## Project Structure
```
├── .github/workflows/    # CI/CD automation
├── database/             # Supabase SQL schemas
├── botpress/             # Chatbot flows & logic
├── scripts/              # Data import utilities
├── docs/                 # Documentation
└── tests/                # Test suite
```

## Setup Guide

1. [GitHub Setup](docs/setup/01-github-setup.md)
2. [Supabase Database](docs/setup/02-supabase-setup.md)
3. [Botpress Configuration](docs/setup/03-botpress-setup.md)
4. [WhatsApp Integration](docs/setup/04-whatsapp-setup.md)

## Data

- 959 customers with grading
- 1,242 workshops with locations
- 231 products with vehicle compatibility

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT License - See [LICENSE](LICENSE)# vehicle-parts-chatbot
