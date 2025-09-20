import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, DollarSign, Users, Clock, TrendingUp } from "lucide-react";
import { useLocation } from "wouter";
import KPICard from "./KPICard";

// todo: remove mock functionality
const mockBusinessActivities = [
  {
    time: "1 hour ago",
    action: "Expense submitted: Office supplies",
    user: "Sarah Williams",
    amount: "$245.50",
    status: "pending",
  },
  {
    time: "3 hours ago",
    action: "Sick leave approved",
    user: "Mike Johnson",
    days: "2 days",
    status: "approved",
  },
  {
    time: "1 day ago",
    action: "Business meeting scheduled",
    user: "Tom Brown",
    details: "Client presentation",
    status: "scheduled",
  },
];

const mockExpenses = [
  { category: "Office Supplies", amount: "$1,245", pending: "$245" },
  { category: "Vehicle Costs", amount: "$2,890", pending: "$0" },
  { category: "Insurance", amount: "$5,200", pending: "$0" },
  { category: "Equipment", amount: "$8,750", pending: "$1,200" },
];

export default function BusinessOverview() {
  const [, navigate] = useLocation();
  
  const handleQuickAction = (action: string) => {
    console.log(`Quick action: ${action}`);
    switch (action) {
      case 'expenses':
        navigate('/business/expenses');
        break;
      case 'timesheets':
        navigate('/business/timesheets');
        break;
      case 'leave':
        navigate('/business/leave');
        break;
    }
  };
  
  return (
    <div className="p-6 space-y-6" data-testid="business-overview">
      {/* Business Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Business Overview</h1>
            <p className="text-muted-foreground">
              Central hub for all business operations and expenses
            </p>
          </div>
          <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            Active Business
          </Badge>
        </div>
      </div>

      {/* Business KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Monthly Expenses"
          value="$18,085"
          change={{ value: "+8%", direction: "up" }}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <KPICard
          title="Pending Expenses"
          value="$1,445"
          icon={<Clock className="h-4 w-4" />}
        />
        <KPICard
          title="Team Members"
          value="15"
          icon={<Users className="h-4 w-4" />}
        />
        <KPICard
          title="Active Projects"
          value="6"
          change={{ value: "+2", direction: "up" }}
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>

      {/* Business Activity and Expense Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Business Activity */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Business Activity</CardTitle>
            <Badge variant="outline">{mockBusinessActivities.length} recent</Badge>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mockBusinessActivities.map((activity, index) => (
                <div key={index} className="flex items-start gap-3 text-sm">
                  <div className={`w-2 h-2 rounded-full mt-2 ${
                    activity.status === "approved" ? "bg-green-500" :
                    activity.status === "pending" ? "bg-yellow-500" : "bg-blue-500"
                  }`} />
                  <div className="flex-1">
                    <p>{activity.action}</p>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>{activity.user}</span>
                      <span>•</span>
                      <span>{activity.time}</span>
                      {activity.amount && (
                        <>
                          <span>•</span>
                          <span className="font-medium">{activity.amount}</span>
                        </>
                      )}
                      {activity.days && (
                        <>
                          <span>•</span>
                          <span className="font-medium">{activity.days}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Expense Categories */}
        <Card>
          <CardHeader>
            <CardTitle>Expense Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mockExpenses.map((expense, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-md">
                  <div>
                    <p className="font-medium">{expense.category}</p>
                    <p className="text-sm text-muted-foreground">
                      Total: {expense.amount}
                      {expense.pending !== "$0" && (
                        <span className="ml-2 text-yellow-600">
                          • Pending: {expense.pending}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge 
                      variant={expense.pending !== "$0" ? "secondary" : "outline"}
                      className={expense.pending !== "$0" ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" : ""}
                    >
                      {expense.pending !== "$0" ? "Has Pending" : "Up to Date"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Business Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div 
              className="p-4 border rounded-md hover-elevate cursor-pointer" 
              data-testid="quick-submit-expense"
              onClick={() => handleQuickAction('expenses')}
            >
              <DollarSign className="h-6 w-6 text-primary mb-2" />
              <h3 className="font-medium">Submit Expense</h3>
              <p className="text-sm text-muted-foreground">Log business expenses and receipts</p>
            </div>
            <div 
              className="p-4 border rounded-md hover-elevate cursor-pointer" 
              data-testid="quick-log-timesheet"
              onClick={() => handleQuickAction('timesheets')}
            >
              <Clock className="h-6 w-6 text-primary mb-2" />
              <h3 className="font-medium">Log Timesheet</h3>
              <p className="text-sm text-muted-foreground">Record working hours and breaks</p>
            </div>
            <div 
              className="p-4 border rounded-md hover-elevate cursor-pointer" 
              data-testid="quick-request-leave"
              onClick={() => handleQuickAction('leave')}
            >
              <Calendar className="h-6 w-6 text-primary mb-2" />
              <h3 className="font-medium">Request Leave</h3>
              <p className="text-sm text-muted-foreground">Submit sick days or vacation requests</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}