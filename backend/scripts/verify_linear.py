import asyncio
import os
import sys
from pathlib import Path

# Add backend to path so we can import tools
sys.path.append(str(Path(__file__).parent.parent))

from tools.linear_tools import get_linear_mcp, RealLinearMCP

async def verify():
    print("Checking Linear Connection...")
    mcp = get_linear_mcp()
    
    if isinstance(mcp, RealLinearMCP):
        print(f"Status: REAL (API Key Found)")
        try:
            res = await mcp.whoami()
            if res.get("status") == "connected":
                print(f"Connected as: {res.get('user')} ({res.get('email')})")
                print(f"Organization: {res.get('organization')}")
                print("\n✅ Linear API is working perfectly.")
            else:
                print(f"❌ Error: {res.get('message')}")
        except Exception as e:
            print(f"❌ Exception: {e}")
    else:
        print("Status: MOCK")
        print("Reason: LINEAR_API_KEY is missing or AEGIS_MOCK_LINEAR is true.")
        print("\n⚠️  System is running in mock mode.")

if __name__ == "__main__":
    asyncio.run(verify())
