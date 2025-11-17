import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertSystemConfigurationSchema, type SystemConfiguration } from "@shared/schema";
import { Settings, Globe, FileText, Building2, ArrowLeft } from "lucide-react";
import { z } from "zod";
import { useLocation } from "wouter";

// Extend schema to coerce number inputs (HTML number inputs return strings)
const formSchema = insertSystemConfigurationSchema.extend({
  estimateStartNumber: z.coerce.number().int().positive(),
  variationStartNumber: z.coerce.number().int().positive(),
  clientInvoiceStartNumber: z.coerce.number().int().positive(),
  billStartNumber: z.coerce.number().int().positive(),
  purchaseOrderStartNumber: z.coerce.number().int().positive(),
  rfqStartNumber: z.coerce.number().int().positive(),
  rfiStartNumber: z.coerce.number().int().positive(),
  proposalStartNumber: z.coerce.number().int().positive(),
  gstRate: z.string(), // Keep as string since it's numeric(precision, scale) in DB
});

export default function SystemConfigurationPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("regional");

  // Fetch system configuration
  const { data: config, isLoading, error } = useQuery<SystemConfiguration>({
    queryKey: ["/api/system-configuration"],
  });

  const form = useForm({
    resolver: zodResolver(formSchema),
    values: config || {
      language: "en-AU",
      measurementSystem: "metric",
      currency: "AUD",
      currencySymbol: "$",
      timezone: "Australia/Sydney",
      temperatureFormat: "celsius",
      dateFormat: "DD/MM/YYYY",
      timeFormat: "12h",
      estimatePrefix: "EST-",
      variationPrefix: "VAR-",
      clientInvoicePrefix: "INV-",
      billPrefix: "BILL-",
      purchaseOrderPrefix: "PO-",
      rfqPrefix: "RFQ-",
      rfiPrefix: "RFI-",
      proposalPrefix: "PROP-",
      estimateStartNumber: 1000,
      variationStartNumber: 1000,
      clientInvoiceStartNumber: 1000,
      billStartNumber: 1000,
      purchaseOrderStartNumber: 1000,
      rfqStartNumber: 1000,
      rfiStartNumber: 1000,
      proposalStartNumber: 1000,
      gstRate: "10.00",
      fiscalYearStart: "07-01",
      defaultPaymentTerms: "Net 30",
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("/api/system-configuration", "PUT", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-configuration"] });
      toast({
        title: "Settings saved",
        description: "System configuration has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save system configuration.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: any) => {
    updateMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <Settings className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">System Configuration</h1>
        </div>
        <p className="text-muted-foreground">Loading system configuration...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <Settings className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">System Configuration</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive">Failed to load system configuration. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center gap-2 mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/settings")}
          className="mr-2"
          data-testid="button-back-to-settings"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Settings
        </Button>
        <Settings className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">System Configuration</h1>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="regional" className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Regional
              </TabsTrigger>
              <TabsTrigger value="documents" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Documents
              </TabsTrigger>
              <TabsTrigger value="business" className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Business
              </TabsTrigger>
            </TabsList>

            {/* Regional Settings Tab */}
            <TabsContent value="regional" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Regional Settings</CardTitle>
                  <CardDescription>
                    Configure language, measurement system, currency, and timezone preferences
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="language"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Language</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-language">
                                <SelectValue placeholder="Select language" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="en-AU">English (Australia)</SelectItem>
                              <SelectItem value="en-US">English (United States)</SelectItem>
                              <SelectItem value="en-GB">English (United Kingdom)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="measurementSystem"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Measurement System</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-measurement">
                                <SelectValue placeholder="Select system" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="metric">Metric (kg, m, m2, etc.)</SelectItem>
                              <SelectItem value="imperial">Imperial (lb, ft, ft2, etc.)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="currency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Currency</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-currency">
                                <SelectValue placeholder="Select currency" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="AUD">Australian Dollar ($)</SelectItem>
                              <SelectItem value="USD">US Dollar ($)</SelectItem>
                              <SelectItem value="GBP">British Pound (£)</SelectItem>
                              <SelectItem value="EUR">Euro (€)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="timezone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Timezone</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-timezone">
                                <SelectValue placeholder="Select timezone" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Australia/Sydney">Australia/Sydney (AEST/AEDT)</SelectItem>
                              <SelectItem value="Australia/Melbourne">Australia/Melbourne (AEST/AEDT)</SelectItem>
                              <SelectItem value="Australia/Brisbane">Australia/Brisbane (AEST)</SelectItem>
                              <SelectItem value="Australia/Perth">Australia/Perth (AWST)</SelectItem>
                              <SelectItem value="Australia/Adelaide">Australia/Adelaide (ACST/ACDT)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Format Preferences</CardTitle>
                  <CardDescription>
                    Configure how dates, times, and temperatures are displayed
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="temperatureFormat"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Temperature Format</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-temperature">
                                <SelectValue placeholder="Select format" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="celsius">Celsius (°C)</SelectItem>
                              <SelectItem value="fahrenheit">Fahrenheit (°F)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="dateFormat"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date Format</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-date-format">
                                <SelectValue placeholder="Select format" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="DD/MM/YYYY">DD/MM/YYYY (15/10/2025)</SelectItem>
                              <SelectItem value="MM/DD/YYYY">MM/DD/YYYY (10/15/2025)</SelectItem>
                              <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (2025-10-15)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="timeFormat"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Time Format</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-time-format">
                                <SelectValue placeholder="Select format" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="12h">12 Hour Clock (2:30 PM)</SelectItem>
                              <SelectItem value="24h">24 Hour Clock (14:30)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Documents Tab */}
            <TabsContent value="documents" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Document Numbering</CardTitle>
                  <CardDescription>
                    Configure automatic numbering prefixes and starting numbers for documents
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Estimates */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Estimates</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="estimatePrefix"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Prefix</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="EST-" data-testid="input-estimate-prefix" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="estimateStartNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Starting Number</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                type="number" 
                                onChange={(e) => field.onChange(parseInt(e.target.value))}
                                data-testid="input-estimate-start"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormItem>
                        <FormLabel>Preview</FormLabel>
                        <div className="h-9 px-3 py-2 border rounded-md bg-muted text-muted-foreground">
                          {form.watch("estimatePrefix")}{form.watch("estimateStartNumber")}
                        </div>
                      </FormItem>
                    </div>
                  </div>

                  {/* Variations */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Variations</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="variationPrefix"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Prefix</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="VAR-" data-testid="input-variation-prefix" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="variationStartNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Starting Number</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                type="number"
                                onChange={(e) => field.onChange(parseInt(e.target.value))}
                                data-testid="input-variation-start"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormItem>
                        <FormLabel>Preview</FormLabel>
                        <div className="h-9 px-3 py-2 border rounded-md bg-muted text-muted-foreground">
                          {form.watch("variationPrefix")}{form.watch("variationStartNumber")}
                        </div>
                      </FormItem>
                    </div>
                  </div>

                  {/* Client Invoices */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Client Invoices</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="clientInvoicePrefix"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Prefix</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="INV-" data-testid="input-invoice-prefix" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="clientInvoiceStartNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Starting Number</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                type="number"
                                onChange={(e) => field.onChange(parseInt(e.target.value))}
                                data-testid="input-invoice-start"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormItem>
                        <FormLabel>Preview</FormLabel>
                        <div className="h-9 px-3 py-2 border rounded-md bg-muted text-muted-foreground">
                          {form.watch("clientInvoicePrefix")}{form.watch("clientInvoiceStartNumber")}
                        </div>
                      </FormItem>
                    </div>
                  </div>

                  {/* Bills */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Bills</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="billPrefix"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Prefix</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="BILL-" data-testid="input-bill-prefix" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="billStartNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Starting Number</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                type="number"
                                onChange={(e) => field.onChange(parseInt(e.target.value))}
                                data-testid="input-bill-start"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormItem>
                        <FormLabel>Preview</FormLabel>
                        <div className="h-9 px-3 py-2 border rounded-md bg-muted text-muted-foreground">
                          {form.watch("billPrefix")}{form.watch("billStartNumber")}
                        </div>
                      </FormItem>
                    </div>
                  </div>

                  {/* Purchase Orders, RFQs, RFIs, Proposals */}
                  <div className="grid grid-cols-2 gap-6">
                    {/* Purchase Orders */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Purchase Orders</h3>
                      <div className="space-y-3">
                        <FormField
                          control={form.control}
                          name="purchaseOrderPrefix"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Prefix</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="PO-" data-testid="input-po-prefix" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="purchaseOrderStartNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Starting Number</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  type="number"
                                  onChange={(e) => field.onChange(parseInt(e.target.value))}
                                  data-testid="input-po-start"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="text-xs text-muted-foreground">
                          Preview: {form.watch("purchaseOrderPrefix")}{form.watch("purchaseOrderStartNumber")}
                        </div>
                      </div>
                    </div>

                    {/* RFQs */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Request for Quotes</h3>
                      <div className="space-y-3">
                        <FormField
                          control={form.control}
                          name="rfqPrefix"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Prefix</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="RFQ-" data-testid="input-rfq-prefix" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="rfqStartNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Starting Number</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  type="number"
                                  onChange={(e) => field.onChange(parseInt(e.target.value))}
                                  data-testid="input-rfq-start"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="text-xs text-muted-foreground">
                          Preview: {form.watch("rfqPrefix")}{form.watch("rfqStartNumber")}
                        </div>
                      </div>
                    </div>

                    {/* RFIs */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Request for Information</h3>
                      <div className="space-y-3">
                        <FormField
                          control={form.control}
                          name="rfiPrefix"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Prefix</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="RFI-" data-testid="input-rfi-prefix" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="rfiStartNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Starting Number</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  type="number"
                                  onChange={(e) => field.onChange(parseInt(e.target.value))}
                                  data-testid="input-rfi-start"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="text-xs text-muted-foreground">
                          Preview: {form.watch("rfiPrefix")}{form.watch("rfiStartNumber")}
                        </div>
                      </div>
                    </div>

                    {/* Proposals */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Proposals</h3>
                      <div className="space-y-3">
                        <FormField
                          control={form.control}
                          name="proposalPrefix"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Prefix</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="PROP-" data-testid="input-proposal-prefix" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="proposalStartNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Starting Number</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  type="number"
                                  onChange={(e) => field.onChange(parseInt(e.target.value))}
                                  data-testid="input-proposal-start"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="text-xs text-muted-foreground">
                          Preview: {form.watch("proposalPrefix")}{form.watch("proposalStartNumber")}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Business Settings Tab */}
            <TabsContent value="business" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Business Settings</CardTitle>
                  <CardDescription>
                    Configure GST, fiscal year, and payment terms
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="gstRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>GST Rate (%)</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="10.00"
                              data-testid="input-gst-rate"
                            />
                          </FormControl>
                          <FormDescription>
                            Current Australian GST rate is 10%
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="fiscalYearStart"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fiscal Year Start</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-fiscal-year">
                                <SelectValue placeholder="Select month" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="01-01">January 1</SelectItem>
                              <SelectItem value="04-01">April 1</SelectItem>
                              <SelectItem value="07-01">July 1 (Australian Tax Year)</SelectItem>
                              <SelectItem value="10-01">October 1</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Australian financial year starts July 1
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="defaultPaymentTerms"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Default Payment Terms</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-payment-terms">
                                <SelectValue placeholder="Select terms" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Due on Receipt">Due on Receipt</SelectItem>
                              <SelectItem value="Net 7">Net 7 days</SelectItem>
                              <SelectItem value="Net 14">Net 14 days</SelectItem>
                              <SelectItem value="Net 30">Net 30 days</SelectItem>
                              <SelectItem value="Net 60">Net 60 days</SelectItem>
                              <SelectItem value="Net 90">Net 90 days</SelectItem>
                              <SelectItem value="COD">Cash on Delivery</SelectItem>
                              <SelectItem value="EOM">End of Month</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Applied to new invoices and bills by default
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => form.reset()}
              data-testid="button-discard"
            >
              Discard Changes
            </Button>
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              data-testid="button-save"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
