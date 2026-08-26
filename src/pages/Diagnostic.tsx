import { useEffect, useState } from 'react';
import { fetchSubmissions } from '../lib/submissions';
import { supabase } from '../lib/supabase';

export default function Diagnostic() {
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const runTests = async () => {
      const envStatus = {
        SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL ? '✅ Set' : '❌ Missing',
        SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing',
        URL_VALUE: import.meta.env.VITE_SUPABASE_URL || 'not configured',
        KEY_LENGTH: import.meta.env.VITE_SUPABASE_ANON_KEY ? `${import.meta.env.VITE_SUPABASE_ANON_KEY.length} chars` : '0 chars',
      };

      // Test 1: Basic connection
      let connResult = '⏳ Testing...';
      try {
        const { data: connData, error: connError } = await supabase
          .from('submissions')
          .select('id,team,date,branch')
          .order('date', { ascending: false })
          .limit(3);

        if (connError) {
          connResult = `❌ Connection error: ${connError.message}`;
        } else {
          connResult = `✅ Connected - found ${connData?.length ?? 0} recent submissions`;
        }
      } catch (e: any) {
        connResult = `❌ Failed: ${e.message}`;
      }

      // Test 2: Count all submissions
      let countResult = '⏳ Testing...';
      try {
        const { count, error: countError } = await supabase
          .from('submissions')
          .select('*', { count: 'exact', head: true });

        if (countError) {
          countResult = `❌ Count error: ${countError.message}`;
        } else {
          countResult = `✅ Total submissions: ${count ?? 0}`;
        }
      } catch (e: any) {
        countResult = `❌ Failed: ${e.message}`;
      }

      // Test 3: Fetch submissions function
      let fetchResult = '⏳ Testing...';
      try {
        const { data, error } = await fetchSubmissions();
        if (error) {
          fetchResult = `❌ Fetch error: ${error?.message || String(error)}`;
        } else {
          fetchResult = `✅ Fetch function returned ${data.length} records`;
        }
      } catch (e: any) {
        fetchResult = `❌ Fetch failed: ${e.message}`;
      }

      // Test 4: Check staff table
      let staffResult = '⏳ Testing...';
      try {
        const { data: staffData, error: staffError } = await supabase
          .from('staff')
          .select('name,team')
          .limit(5);

        if (staffError) {
          staffResult = `❌ Staff query error: ${staffError.message}`;
        } else {
          staffResult = `✅ Staff table OK - sample: ${JSON.stringify(staffData?.map(s => s.name))}`;
        }
      } catch (e: any) {
        staffResult = `❌ Failed: ${e.message}`;
      }

      setResults({
        env: envStatus,
        connection: connResult,
        count: countResult,
        fetch: fetchResult,
        staff: staffResult,
        timestamp: new Date().toISOString(),
      });
      setLoading(false);
    };

    runTests();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '40px', fontFamily: 'monospace' }}>
        <h2>Running diagnostic tests...</h2>
        <p>Wait a few seconds please...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '40px', fontFamily: 'monospace', maxWidth: '1000px' }}>
      <h1>🔧 Supabase Connection Diagnostic</h1>
      <small>Last updated: {results.timestamp}</small>
      
      <div style={{ marginTop: '30px' }}>
        <h2>1. Environment Variables</h2>
        <pre style={{ background: '#f5f5f5', padding: '20px', borderRadius: '8px' }}>
{Object.entries(results.env).map(([k, v]) => `${k}: ${v}`).join('\n')}
        </pre>
      </div>

      <div style={{ marginTop: '20px' }}>
        <h2>2. Database Connection Tests</h2>
        <div style={{ display: 'grid', gap: '15px' }}>
          <div style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '8px' }}>
            <strong>Test 1 - Recent Submissions:</strong>
            <br />{results.connection}
          </div>
          <div style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '8px' }}>
            <strong>Test 2 - Total Count:</strong>
            <br />{results.count}
          </div>
          <div style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '8px' }}>
            <strong>Test 3 - Fetch Function:</strong>
            <br />{results.fetch}
          </div>
          <div style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '8px' }}>
            <strong>Test 4 - Staff Table:</strong>
            <br />{results.staff}
          </div>
        </div>
      </div>

      <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#fff3cd', border: '1px solid #ffeaa7', borderRadius: '8px' }}>
        <strong>💡 Action Required:</strong>
        <ul style={{ textAlign: 'left' }}>
          <li>If you see "Missing" env vars → Add them in <strong>Cloudflare Dashboard → Settings → Environment Variables</strong></li>
          <li>If you see connection errors → Check Supabase project URL and anon key</li>
          <li>If you see permission errors → Check RLS policies in Supabase SQL Editor</li>
          <li>If all tests pass but app shows demo data → Clear browser cache or try incognito mode</li>
        </ul>
      </div>
    </div>
  );
}
