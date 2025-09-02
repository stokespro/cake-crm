# 🚀 Deployment Guide for Cannabis CRM

## ✅ Local Deployment Status
Your app is now running locally at: **http://localhost:3000**

### Test Your Local App:
1. Open http://localhost:3000 in your browser
2. Click "Sign up" to create your first account
3. Log in and explore the dashboard

## 📱 Test on Mobile
- Local Network: http://192.168.1.242:3000
- Make sure your phone is on the same WiFi network

## 🌐 Deploy to Vercel

### Option 1: Deploy via GitHub (Recommended)

1. **Push to GitHub:**
```bash
git init
git add .
git commit -m "Cannabis CRM - Ready for deployment"
git branch -M main
git remote add origin https://github.com/[your-username]/cake-crm.git
git push -u origin main
```

2. **Deploy on Vercel:**
- Go to [vercel.com](https://vercel.com)
- Click "Add New" → "Project"
- Import your GitHub repository
- Configure environment variables:
  ```
  NEXT_PUBLIC_SUPABASE_URL = https://jwsidjgsjohhrntxdljp.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3c2lkamdzam9oaHJudHhkbGpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY3ODkzNjEsImV4cCI6MjA3MjM2NTM2MX0.hlifwdy3kdyvRhPiLUrXAhzjnU_w7fGstdejYyxJMbM
  SUPABASE_SERVICE_ROLE_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3c2lkamdzam9oaHJudHhkbGpwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Njc4OTM2MSwiZXhwIjoyMDcyMzY1MzYxfQ.o6xN2qytCEiLM1CV1cSzSdJ0mtTxXQY2iYXrqa9cDpA
  ```
- Click "Deploy"

### Option 2: Deploy via Vercel CLI

```bash
vercel

# Follow the prompts:
# - Set up and deploy? Yes
# - Which scope? Your account
# - Link to existing project? No
# - Project name? cake-crm
# - Directory? ./
# - Want to override settings? No
```

Then set environment variables:
```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
```

Deploy to production:
```bash
vercel --prod
```

## 🔧 Post-Deployment Setup

### Configure Supabase Authentication URLs

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **URL Configuration**
3. Update these settings:

**Site URL:**
```
https://your-app-name.vercel.app
```

**Redirect URLs (add all):**
```
https://your-app-name.vercel.app/**
http://localhost:3000/**
```

## ✅ Deployment Checklist

- [x] Supabase project created
- [x] Database schema applied
- [x] Environment variables configured
- [x] Local deployment working
- [ ] Pushed to GitHub
- [ ] Deployed to Vercel
- [ ] Supabase URLs configured
- [ ] First user account created

## 🎯 Quick Commands

```bash
# Stop local server
# Press Ctrl+C in terminal

# Restart local server
npm run dev

# Build for production
npm run build

# Check for issues
npm run lint
npm run type-check
```

## 🆘 Troubleshooting

### If login doesn't work after deployment:
1. Check Supabase Authentication → URL Configuration
2. Make sure your Vercel URL is added to redirect URLs
3. Wait 2-3 minutes for changes to propagate

### If you see "Invalid URL" error:
- Environment variables might not be set correctly in Vercel
- Go to Vercel Dashboard → Settings → Environment Variables
- Re-add all three variables and redeploy

### To redeploy after changes:
```bash
git add .
git commit -m "Update"
git push
# Vercel will auto-deploy
```

## 🎉 Success!

Your Cannabis CRM is ready to use! 

**Local:** http://localhost:3000
**Production:** https://your-app.vercel.app

**Default User Role:** All new signups are "agents" by default.
To change roles, update the `role` field in the Supabase `profiles` table.