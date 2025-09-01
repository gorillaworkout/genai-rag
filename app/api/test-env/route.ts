export const runtime = "nodejs";

export async function GET() {
  try {
    // Check all critical environment variables
    const envStatus = {
      // OpenAI API Key
      openai: {
        hasApiKey: !!process.env.API_KEY,
        apiKeyLength: process.env.API_KEY?.length || 0,
        apiKeyPrefix: process.env.API_KEY?.substring(0, 7) || 'none',
        isValidFormat: process.env.API_KEY?.startsWith('sk-') || false
      },
      
      // Database connections
      database: {
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        hasDirectUrl: !!process.env.DIRECT_URL,
        databaseUrlPrefix: process.env.DATABASE_URL?.substring(0, 20) || 'none',
        directUrlPrefix: process.env.DIRECT_URL?.substring(0, 20) || 'none'
      },
      
      // Supabase credentials
      supabase: {
        hasUrl: !!process.env.SUPABASE_URL,
        hasAnonKey: !!process.env.SUPABASE_ANON_KEY,
        hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        urlPrefix: process.env.SUPABASE_URL?.substring(0, 25) || 'none',
        anonKeyPrefix: process.env.SUPABASE_ANON_KEY?.substring(0, 10) || 'none'
      },
      
      // LangChain
      langchain: {
        hasApiKey: !!process.env.LANGCHAIN_API_KEY,
        hasTracing: !!process.env.LANGCHAIN_TRACING_V2,
        apiKeyPrefix: process.env.LANGCHAIN_API_KEY?.substring(0, 10) || 'none'
      },
      
      // Pinecone
      pinecone: {
        hasApiKey: !!process.env.PINECONE_API_KEY,
        apiKeyPrefix: process.env.PINECONE_API_KEY?.substring(0, 10) || 'none'
      },
      
      // System
      system: {
        nodeEnv: process.env.NODE_ENV || 'not set',
        timestamp: new Date().toISOString(),
        deployment: 'vercel'
      }
    };

    // Check if all critical variables are present
    const criticalVars = [
      'API_KEY',
      'DATABASE_URL', 
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY'
    ];
    
    const missingVars = criticalVars.filter(varName => !process.env[varName]);
    
    return Response.json({
      ok: true,
      message: 'Environment variables test',
      status: missingVars.length === 0 ? '✅ All critical variables present' : '❌ Missing critical variables',
      missingVariables: missingVars,
      details: envStatus,
      recommendations: {
        openai: envStatus.openai.hasApiKey ? '✅ OpenAI API key ready' : '❌ Set API_KEY environment variable',
        database: envStatus.database.hasDatabaseUrl ? '✅ Database connection ready' : '❌ Set DATABASE_URL environment variable',
        supabase: envStatus.supabase.hasUrl && envStatus.supabase.hasAnonKey ? '✅ Supabase ready' : '❌ Set Supabase environment variables'
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return Response.json({
      ok: false,
      error: errorMessage,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// Test POST method too
export async function POST() {
  try {
    const body = await Response.json({
      ok: true,
      message: 'POST method working',
      method: 'POST',
      timestamp: new Date().toISOString(),
      envVars: {
        hasApiKey: !!process.env.API_KEY,
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        nodeEnv: process.env.NODE_ENV
      }
    });
    
    return body;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return Response.json({
      ok: false,
      error: errorMessage,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
