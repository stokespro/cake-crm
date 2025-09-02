# Cannabis Wholesale CRM

A mobile-first CRM web application designed for cannabis wholesale businesses, enabling sales agents to manage communications, tasks, and orders with dispensary customers.

## Features

- 📱 **Mobile-First Design** - Optimized for use on mobile devices in the field
- 🔐 **Role-Based Authentication** - Secure access for agents, management, and admin users
- 💬 **Communication Logging** - Track all client interactions with detailed notes
- ✅ **Task Management** - Create and manage follow-up tasks with due dates
- 🛒 **Order Management** - Submit and track wholesale orders
- 🏢 **Dispensary Profiles** - Maintain customer information and licenses
- 📦 **Product Catalog** - Manage cannabis strains and pricing
- 📊 **Dashboard Analytics** - Real-time overview of sales and activities

## Tech Stack

- **Frontend**: Next.js 15 (App Router)
- **UI Components**: ShadCN UI + Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Hosting**: Vercel
- **Language**: TypeScript

## Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account
- Vercel account (for deployment)

## Setup Instructions

### 1. Clone and Install

```bash
# Clone the repository
git clone [your-repo-url]
cd cake-crm

# Install dependencies
npm install
```

### 2. Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)

2. Copy your project URL and API keys from Settings > API

3. Run the database schema:
   - Go to SQL Editor in Supabase dashboard
   - Copy the contents of `supabase/schema.sql`
   - Run the SQL to create all tables and policies

### 3. Environment Variables

Create a `.env.local` file and add your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### 4. Run Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## Deployment to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin [your-github-repo]
git push -u origin main
```

### 2. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "New Project"
3. Import your GitHub repository
4. Configure environment variables:
   - Add the same variables from `.env.local`
5. Click "Deploy"

### 3. Configure Supabase URLs

After deployment, update your Supabase project:

1. Go to Authentication > URL Configuration
2. Add your Vercel URL to:
   - Site URL: `https://your-app.vercel.app`
   - Redirect URLs: `https://your-app.vercel.app/**`

## Database Schema

### Tables

- **profiles** - User profiles with roles (agent/management/admin)
- **dispensary_profiles** - Customer dispensary information
- **products** - Cannabis strains and pricing
- **communications** - Client interaction logs
- **tasks** - Follow-up tasks and reminders
- **orders** - Wholesale order records
- **order_items** - Individual line items in orders

### User Roles

- **Agent** - Can manage their own data
- **Management** - Can view all data and manage orders
- **Admin** - Full system access

## Project Structure

```
cake-crm/
├── app/                    # Next.js app directory
│   ├── dashboard/         # Protected dashboard routes
│   │   ├── communications/
│   │   ├── tasks/
│   │   ├── orders/
│   │   ├── dispensaries/
│   │   └── products/
│   ├── login/            # Authentication pages
│   └── signup/
├── components/            # Reusable UI components
│   └── ui/               # ShadCN UI components
├── lib/                  # Utility functions
│   └── supabase/        # Supabase client configs
├── types/               # TypeScript type definitions
└── supabase/           # Database schema and migrations
```

## Mobile-First Features

- **Touch-Friendly UI** - Large tap targets and swipe gestures
- **Responsive Layouts** - Adapts to all screen sizes
- **Offline Support** - Works with limited connectivity (planned)
- **Quick Actions** - Fast access to common tasks
- **Search & Filter** - Find information quickly

## API Routes

All API operations are handled through Supabase's auto-generated REST API with Row Level Security (RLS) policies.

### Example Queries

```javascript
// Fetch communications
const { data } = await supabase
  .from('communications')
  .select('*, dispensary:dispensary_profiles(*)')
  .order('interaction_date', { ascending: false })

// Create task
const { data } = await supabase
  .from('tasks')
  .insert({
    title: 'Follow up',
    due_date: '2024-01-15',
    dispensary_id: 'uuid'
  })

// Submit order
const { data } = await supabase
  .from('orders')
  .insert({
    dispensary_id: 'uuid',
    requested_delivery_date: '2024-01-20'
  })
```

## Development Tips

### Adding New Components

```bash
# Add ShadCN components
npx shadcn@latest add [component-name]
```

### Database Migrations

1. Make changes in `supabase/schema.sql`
2. Run in Supabase SQL Editor
3. Test thoroughly before production

### Testing

```bash
# Run type checking
npm run type-check

# Run linting
npm run lint

# Build for production
npm run build
```

## Support

For issues or questions:
1. Check the documentation
2. Review Supabase logs
3. Contact support team

## License

Private - All rights reserved

---

Built with ❤️ for the cannabis industry
