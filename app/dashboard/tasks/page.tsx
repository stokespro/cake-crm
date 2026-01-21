'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Search, Calendar, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import type { Task } from '@/types/database'

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const supabase = createClient()

  useEffect(() => {
    fetchTasks()
  }, [])

  useEffect(() => {
    filterTasks()
  }, [tasks, searchTerm, filterStatus, filterPriority])

  const fetchTasks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('sales_tasks')
        .select(`
          *,
          customer:customers(business_name)
        `)
        .eq('agent_id', user.id)
        .order('due_date', { ascending: true })

      if (error) throw error
      setTasks(data || [])
    } catch (error) {
      console.error('Error fetching tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterTasks = () => {
    let filtered = [...tasks]

    if (searchTerm) {
      filtered = filtered.filter(task => 
        task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.customer?.business_name?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter(task => task.status === filterStatus)
    }

    if (filterPriority !== 'all') {
      filtered = filtered.filter(task => task.priority.toString() === filterPriority)
    }

    setFilteredTasks(filtered)
  }

  const markComplete = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from('sales_tasks')
        .update({ 
          status: 'complete',
          completed_at: new Date().toISOString()
        })
        .eq('id', taskId)

      if (error) throw error
      fetchTasks()
    } catch (error) {
      console.error('Error updating task:', error)
    }
  }

  const getPriorityIcon = (priority: number) => {
    switch (priority) {
      case 1:
        return <AlertCircle className="h-4 w-4 text-red-500" />
      case 2:
        return <Clock className="h-4 w-4 text-yellow-500" />
      case 3:
        return <Clock className="h-4 w-4 text-blue-500" />
      default:
        return null
    }
  }

  const getPriorityLabel = (priority: number) => {
    switch (priority) {
      case 1:
        return 'High'
      case 2:
        return 'Medium'
      case 3:
        return 'Low'
      default:
        return 'Unknown'
    }
  }

  const isOverdue = (dueDate: string) => {
    return new Date(dueDate) < new Date() && tasks.find(t => t.due_date === dueDate)?.status === 'pending'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading tasks...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Tasks</h1>
          <p className="text-muted-foreground mt-1">Manage your follow-ups and to-dos</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/tasks/new">
            <Plus className="mr-2 h-4 w-4" />
            New Task
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tasks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger>
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="1">High Priority</SelectItem>
                <SelectItem value="2">Medium Priority</SelectItem>
                <SelectItem value="3">Low Priority</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center text-sm text-muted-foreground">
              {filteredTasks.length} of {tasks.length} tasks
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tasks List */}
      <div className="space-y-4">
        {filteredTasks.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No tasks found</p>
              <Button className="mt-4" asChild>
                <Link href="/dashboard/tasks/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Task
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          filteredTasks.map((task) => (
            <Card key={task.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 md:p-6">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        {task.status === 'complete' ? (
                          <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                        ) : (
                          getPriorityIcon(task.priority)
                        )}
                        <div>
                          <h3 className="font-semibold text-lg">{task.title}</h3>
                          {task.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {task.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      {task.customer && (
                        <span className="text-muted-foreground">
                          {task.customer.business_name}
                        </span>
                      )}
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className={isOverdue(task.due_date) ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
                          Due {format(new Date(task.due_date), 'MMM d, yyyy')}
                        </span>
                      </div>
                      {task.status === 'pending' && (
                        <Badge variant="outline">
                          {getPriorityLabel(task.priority)} Priority
                        </Badge>
                      )}
                      {task.status === 'complete' && (
                        <Badge variant="default" className="bg-green-600">
                          Completed
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  {task.status === 'pending' && (
                    <Button
                      size="sm"
                      onClick={() => markComplete(task.id)}
                      className="whitespace-nowrap"
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Mark Complete
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}