# Cannabis Wholesale CRM - Quick Setup Guide

## 🚀 Quick Start (10 minutes)

### Step 1: Supabase Setup (5 minutes)

1. **Create Supabase Account**
   - Go to [supabase.com](https://supabase.com)
   - Sign up for a free account
   - Create a new project (choose a strong database password)

2. **Get Your API Keys**
   - Once project is created, go to Settings → API
   - Copy these values:
     - Project URL (looks like: https://xxxxx.supabase.co)
     - Anon/Public Key (starts with: eyJ...)
     - Service Role Key (also starts with: eyJ...)

3. **Run Database Schema**
   - In Supabase dashboard, go to SQL Editor
   - Click "New Query"
   - Copy ALL contents from `supabase/schema.sql`
   - Paste and click "Run"
   - You should see "Success" message

### Step 2: Configure Environment (2 minutes)

1. **Update Environment Variables**
   Open `.env.local` and replace with your actual values:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=eyJ...your-service-role-key
   ```

### Step 3: Run the App (3 minutes)

1. **Install Dependencies** (if not already done)
   ```bash
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm run dev
   ```

3. **Open Browser**
   - Go to [http://localhost:3000](http://localhost:3000)
   - You'll be redirected to the login page

### Step 4: Create Your First User

1. Click "Sign up"
2. Enter your details
3. Sign in with your new account
4. Start using the CRM!

## 📱 Mobile Testing

To test on your phone:
1. Find your computer's IP address
2. On your phone, visit: `http://[your-ip]:3000`
3. Make sure both devices are on the same network

## 🚀 Deploy to Production (5 minutes)

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial CRM setup"
git remote add origin [your-github-repo]
git push -u origin main
```

### 2. Deploy on Vercel
1. Go to [vercel.com](https://vercel.com)
2. Click "Import Project"
3. Select your GitHub repo
4. Add environment variables (same as .env.local)
5. Click "Deploy"

### 3. Update Supabase Settings
After deployment:
1. Go to Supabase → Authentication → URL Configuration
2. Update:
   - Site URL: `https://your-app.vercel.app`
   - Redirect URLs: Add `https://your-app.vercel.app/**`

## ✅ You're Ready!

Your CRM is now live and ready for use. 

### Default User Roles:
- **Agent**: Regular sales agent (default for new signups)
- **Management**: Can view all data and manage orders
- **Admin**: Full system access

To change user roles, update the `role` field in the `profiles` table in Supabase.

## 🆘 Troubleshooting

### "Invalid URL" Error
- Make sure you've updated `.env.local` with real Supabase credentials
- Restart the development server after changing environment variables

### Can't Sign In
- Check that the database schema was run successfully
- Verify your Supabase project is active

### Build Errors
- Run `npm install` to ensure all dependencies are installed
- Check that Node.js version is 18 or higher

## 📞 Need Help?

- Check the full README.md for detailed documentation
- Review Supabase logs in your dashboard
- Ensure all environment variables are set correctly