export const runtime = "nodejs";

import { embeddings } from "@/lib/vectorstore";

export async function GET() {
  try {
    console.log('🧪 Testing embeddings endpoint...');
    
    // Check environment variables
    const envCheck = {
      hasApiKey: !!process.env.API_KEY,
      apiKeyLength: process.env.API_KEY?.length || 0,
      apiKeyPrefix: process.env.API_KEY?.substring(0, 10) || 'none',
      nodeEnv: process.env.NODE_ENV
    };
    
    console.log('🔍 Environment check:', envCheck);
    
    // Test simple text embedding
    const testText = "Hello world";
    console.log('📝 Testing embedding for:', testText);
    
    const embedding = await embeddings.embedQuery(testText);
    
    console.log('✅ Embedding successful!');
    console.log('📊 Embedding length:', embedding.length);
    console.log('📊 First few values:', embedding.slice(0, 5));
    
    return Response.json({
      ok: true,
      message: 'Embeddings test successful',
      envCheck,
      embedding: {
        length: embedding.length,
        sample: embedding.slice(0, 5),
        testText
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('❌ Embeddings test failed:', errorMessage);
    
    return Response.json({
      ok: false,
      error: errorMessage,
      envCheck: {
        hasApiKey: !!process.env.API_KEY,
        apiKeyLength: process.env.API_KEY?.length || 0,
        apiKeyPrefix: process.env.API_KEY?.substring(0, 10) || 'none',
        nodeEnv: process.env.NODE_ENV
      },
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
