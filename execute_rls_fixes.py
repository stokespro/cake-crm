import requests
import json

# Supabase configuration
SUPABASE_URL = "https://jwsidjgsjohhrntxdljp.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3c2lkamdzam9oaHJudHhkbGpwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Njc4OTM2MSwiZXhwIjoyMDcyMzY1MzYxfQ.o6xN2qytCEiLM1CV1cSzSdJ0mtTxXQY2iYXrqa9cDpA"

headers = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json"
}

# Test if we can execute a simple function
print("Testing RPC execution...")

# Create the is_admin function
sql_function = """
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = user_id AND role = 'admin'
    );
END;
$$;
"""

print("Attempting to create is_admin function...")
print(f"SQL: {sql_function}")

# Try to execute via RPC
try:
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/exec_sql",
        headers=headers,
        json={"sql": sql_function}
    )
    print(f"Response: {response.status_code} - {response.text}")
except Exception as e:
    print(f"Error: {e}")
