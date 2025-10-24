import { useState } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Calculator, Clock, Plus } from "lucide-react";

export default function Takeoff() {
  const { projectId } = useParams<{ projectId?: string }>();
  const [activeTab, setActiveTab] = useState("measurements");

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Take-off</h1>
            <p className="text-muted-foreground mt-1">
              Manage quantity take-offs and labour hours
            </p>
          </div>
        </div>

        {/* Main Content Card */}
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Take-off Details
              </CardTitle>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="border-b px-6 pt-4">
                <TabsList className="h-10">
                  <TabsTrigger value="measurements" className="text-sm" data-testid="tab-measurements">
                    <Calculator className="h-4 w-4 mr-2" />
                    Measurements
                  </TabsTrigger>
                  <TabsTrigger value="labour" className="text-sm" data-testid="tab-labour">
                    <Clock className="h-4 w-4 mr-2" />
                    Labour Hours
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="measurements" className="p-6 m-0">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Measurements & Quantities</h3>
                    <Button size="sm" data-testid="button-add-measurement">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Measurement
                    </Button>
                  </div>

                  <div className="text-center py-12 border-2 border-dashed rounded-lg">
                    <Calculator className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No measurements yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Start adding measurements and quantities for this project
                    </p>
                    <Button variant="outline" data-testid="button-add-first-measurement">
                      <Plus className="w-4 h-4 mr-2" />
                      Add First Measurement
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="labour" className="p-6 m-0">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Labour Hours</h3>
                    <Button size="sm" data-testid="button-add-labour">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Labour Entry
                    </Button>
                  </div>

                  <div className="text-center py-12 border-2 border-dashed rounded-lg">
                    <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No labour hours tracked yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Track labour hours for accurate project costing
                    </p>
                    <Button variant="outline" data-testid="button-add-first-labour">
                      <Plus className="w-4 w-4 mr-2" />
                      Add First Labour Entry
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
