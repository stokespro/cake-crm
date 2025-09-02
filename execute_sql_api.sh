#!/bin/bash

# Supabase API execution script
SUPABASE_URL="https://jwsidjgsjohhrntxdljp.supabase.co"
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3c2lkamdzam9oaHJudHhkbGpwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Njc4OTM2MSwiZXhwIjoyMDcyMzY1MzYxfQ.o6xN2qytCEiLM1CV1cSzSdJ0mtTxXQY2iYXrqa9cDpA"

# First, let's check if we can promote the user using a simple API call
echo "Testing Supabase connection..."
curl -X GET "$SUPABASE_URL/rest/v1/profiles?select=email,role&limit=5" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"

echo -e "\n\nAttempting to promote user to admin..."
# Try to update the user role directly
curl -X PATCH "$SUPABASE_URL/rest/v1/profiles?email=eq.stokes@cakeoklahoma.com" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"role": "admin"}'