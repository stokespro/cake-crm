# 🚀 Vercel Deployment Instructions

## ✅ GitHub Repository Ready!

Your code is now live at: **https://github.com/stokespro/cake-crm**

## 📋 Deploy to Vercel (2 minutes)

### Step 1: Go to Vercel
1. Open [vercel.com](https://vercel.com) in your browser
2. Sign in with your GitHub account (or create account)

### Step 2: Import Project
1. Click **"Add New..."** → **"Project"**
2. Look for **"cake-crm"** in your repositories
3. Click **"Import"**

### Step 3: Configure Environment Variables
Add these three environment variables in the Vercel dashboard:

| Variable Name | Value |
|--------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://jwsidjgsjohhrntxdljp.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3c2lkamdzam9oaHJudHhkbGpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY3ODkzNjEsImV4cCI6MjA3MjM2NTM2MX0.hlifwdy3kdyvRhPiLUrXAhzjnU_w7fGstdejYyxJMbM` |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3c2lkamdzam9oaHJudHhkbGpwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Njc4OTM2MSwiZXhwIjoyMDcyMzY1MzYxfQ.o6xN2qytCEiLM1CV1cSzSdJ0mtTxXQY2iYXrqa9cDpA` |

### Step 4: Deploy
1. Click **"Deploy"**
2. Wait 1-2 minutes for deployment to complete
3. You'll get a URL like: `https://cake-crm.vercel.app`

## 🔧 After Deployment: Configure Supabase

### IMPORTANT: Update Supabase Authentication URLs

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard/project/jwsidjgsjohhrntxdljp)
2. Navigate to **Authentication** → **URL Configuration**
3. Update these settings:

**Site URL:**
```
https://cake-crm.vercel.app
```
(Replace with your actual Vercel URL)

**Redirect URLs:** (Add both)
```
https://cake-crm.vercel.app/**
http://localhost:3000/**
```

4. Click **Save**

## ✅ Deployment Complete!

Your CRM will be live at your Vercel URL (something like):
- **Production:** https://cake-crm.vercel.app
- **GitHub:** https://github.com/stokespro/cake-crm

### Test Your Deployment:
1. Visit your Vercel URL
2. Sign up for a new account
3. Start using your CRM!

## 🔄 Future Updates

Whenever you make changes locally:

```bash
git add .
git commit -m "Your update message"
git push
```

Vercel will automatically redeploy your changes!

## 🆘 Troubleshooting

### If login doesn't work:
- Make sure you updated Supabase URL Configuration (Step above)
- Wait 2-3 minutes for changes to propagate
- Clear browser cache and try again

### If you see errors:
- Check Vercel dashboard → Functions tab for logs
- Verify all 3 environment variables are set correctly
- Make sure there are no typos in the environment values

## 📱 Share Your CRM

Once deployed, you can access your CRM from:
- Any desktop browser
- Mobile phones
- Tablets

Just share the Vercel URL with your team!

---

**Status:** ✅ Ready for Vercel deployment
**Repository:** https://github.com/stokespro/cake-crm
**Next Step:** Follow the steps above in Vercel dashboard