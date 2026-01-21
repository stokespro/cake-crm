'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface TestResult {
  name: string
  success: boolean
  data?: unknown
  error?: unknown
}

export function DatabaseTest() {
  const [results, setResults] = useState<TestResult[]>([])
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const tests = [
    {
      name: 'Test Auth Status',
      test: async () => {
        const { data, error } = await supabase.auth.getUser()
        return { data, error, type: 'auth' }
      }
    },
    {
      name: 'Test User Profile',
      test: async () => {
        const { data: user } = await supabase.auth.getUser()
        if (!user.user) return { error: 'No user found' }
        
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.user.id)
          .single()
        return { data, error, type: 'profile' }
      }
    },
    {
      name: 'Test Products (Simple)',
      test: async () => {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .order('strain_name')
        return { data, error, type: 'products-simple' }
      }
    },
    {
      name: 'Test Product Pricing Table',
      test: async () => {
        const { data, error } = await supabase
          .from('product_pricing')
          .select('*')
        return { data, error, type: 'product-pricing' }
      }
    },
    {
      name: 'Test Products with JOIN',
      test: async () => {
        const { data, error } = await supabase
          .from('products')
          .select(`
            *,
            product_pricing(
              id,
              min_quantity,
              price
            )
          `)
          .order('strain_name')
        return { data, error, type: 'products-join' }
      }
    },
    {
      name: 'Test with LEFT JOIN syntax',
      test: async () => {
        const { data, error } = await supabase
          .from('products')
          .select(`
            *,
            pricing:product_pricing!left(
              id,
              min_quantity,
              price
            )
          `)
          .order('strain_name')
        return { data, error, type: 'products-left-join' }
      }
    }
  ]

  const runAllTests = async () => {
    setLoading(true)
    setResults([])
    
    for (const test of tests) {
      try {
        const result = await test.test()
        setResults(prev => [...prev, { 
          name: test.name, 
          success: !result.error,
          ...result
        }])
      } catch (error) {
        setResults(prev => [...prev, { 
          name: test.name, 
          success: false,
          error: error
        }])
      }
    }
    
    setLoading(false)
  }

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle>Database Connection Tests</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={runAllTests} disabled={loading}>
          {loading ? 'Running Tests...' : 'Run All Tests'}
        </Button>
        
        <div className="space-y-4">
          {results.map((result, index) => (
            <div key={index} className={`p-4 border rounded ${
              result.success ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'
            }`}>
              <h3 className="font-semibold">{result.name}</h3>
              <div className={`text-sm ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                Status: {result.success ? 'SUCCESS' : 'FAILED'}
              </div>
              
              {result.error ? (
                <div className="mt-2">
                  <strong>Error:</strong>
                  <pre className="text-xs bg-gray-100 p-2 rounded mt-1 overflow-auto">
                    {JSON.stringify(result.error, null, 2)}
                  </pre>
                </div>
              ) : null}

              {result.data ? (
                <div className="mt-2">
                  <strong>Data ({Array.isArray(result.data) ? (result.data as unknown[]).length : 1} items):</strong>
                  <pre className="text-xs bg-gray-100 p-2 rounded mt-1 overflow-auto max-h-48">
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}