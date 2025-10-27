import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Calendar as CalendarIcon, Check, X, User as UserIcon, Mail, Phone, Building2 } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import type { User } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

export default function UserProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [phone, setPhone] = useState(user?.phone || "");

  // Update user profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; phone: string }) => {
      return await apiRequest(`/api/users/${user?.id}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
      setIsEditing(false);
    },
  });

  // Disconnect Google Calendar mutation
  const disconnectGoogleCalendarMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/auth/google/disconnect", "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Calendar disconnected",
        description: "Your Google Calendar has been disconnected.",
      });
    },
  });

  const handleSave = () => {
    updateProfileMutation.mutate({ firstName, lastName, phone });
  };

  const handleConnectGoogleCalendar = () => {
    // Redirect to OAuth flow
    window.location.href = "/api/auth/google/initiate";
  };

  const handleDisconnectGoogleCalendar = () => {
    if (confirm("Are you sure you want to disconnect your Google Calendar?")) {
      disconnectGoogleCalendarMutation.mutate();
    }
  };

  const isGoogleCalendarConnected = !!user?.googleCalendarEmail;

  return (
    <div className="flex flex-col h-full" data-testid="user-profile">
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Page Header */}
          <div>
            <h1 className="text-3xl font-bold">User Profile</h1>
            <p className="text-muted-foreground">
              Manage your personal information and connected services
            </p>
          </div>

          {/* Personal Information */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <UserIcon className="h-5 w-5" />
                    Personal Information
                  </CardTitle>
                  <CardDescription>
                    Update your name and contact details
                  </CardDescription>
                </div>
                {!isEditing && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                    data-testid="button-edit-profile"
                  >
                    Edit
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={!isEditing}
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={!isEditing}
                    data-testid="input-last-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </Label>
                <Input
                  id="email"
                  value={user?.email || ""}
                  disabled
                  data-testid="input-email"
                />
                <p className="text-xs text-muted-foreground">
                  Email cannot be changed
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Phone
                </Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={!isEditing}
                  placeholder="(optional)"
                  data-testid="input-phone"
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Company
                </Label>
                <Input
                  value={user?.companyId || ""}
                  disabled
                />
                <p className="text-xs text-muted-foreground">
                  Company membership is managed by your administrator
                </p>
              </div>

              {isEditing && (
                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={handleSave}
                    disabled={updateProfileMutation.isPending}
                    data-testid="button-save-profile"
                  >
                    {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsEditing(false);
                      setFirstName(user?.firstName || "");
                      setLastName(user?.lastName || "");
                      setPhone(user?.phone || "");
                    }}
                    data-testid="button-cancel-edit"
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Google Calendar Integration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                Google Calendar Integration
              </CardTitle>
              <CardDescription>
                Connect your Google Calendar to sync BuildPro tasks and events
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isGoogleCalendarConnected ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/20">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <SiGoogle className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{user.googleCalendarEmail}</span>
                          <Badge variant="default" className="gap-1">
                            <Check className="h-3 w-3" />
                            Connected
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Connected {user.googleCalendarConnectedAt && format(new Date(user.googleCalendarConnectedAt), "MMM d, yyyy")}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDisconnectGoogleCalendar}
                      disabled={disconnectGoogleCalendarMutation.isPending}
                      data-testid="button-disconnect-google-calendar"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Disconnect
                    </Button>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                      Sync Features
                    </h4>
                    <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                      <li>• Tasks with due dates sync to Google Calendar</li>
                      <li>• Schedule items appear as calendar events</li>
                      <li>• Changes in BuildPro update your Google Calendar</li>
                      <li>• Automatic sync every hour</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 border rounded-lg">
                    <div className="h-10 w-10 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                      <SiGoogle className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium mb-1">Connect Your Google Calendar</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        Link your Google account to automatically sync tasks and schedule items to your personal calendar. You'll be able to see all your BuildPro events alongside your other appointments.
                      </p>
                      <Button
                        onClick={handleConnectGoogleCalendar}
                        className="gap-2"
                        data-testid="button-connect-google-calendar"
                      >
                        <SiGoogle className="h-4 w-4" />
                        Connect Google Calendar
                      </Button>
                    </div>
                  </div>

                  <div className="bg-muted/50 rounded-lg p-4">
                    <h4 className="font-medium mb-2">What gets synced?</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Tasks assigned to you with due dates</li>
                      <li>• Schedule items from your projects</li>
                      <li>• Meeting minutes and site diary entries</li>
                    </ul>
                    <p className="text-xs text-muted-foreground mt-3">
                      Note: Google Calendar credentials are required. Contact your administrator if you need help setting this up.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
