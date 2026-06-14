import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserPlus, Mail, Lock, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const createEmployeeSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  displayName: z.string().min(2, "Display name must be at least 2 characters"),
});

type CreateEmployeeFormData = z.infer<typeof createEmployeeSchema>;

export function EmployeeAccountManager() {
  const [isLoading, setIsLoading] = useState(false);
  const [createdEmployees, setCreatedEmployees] = useState<string[]>([]);
  const { toast } = useToast();

  const form = useForm<CreateEmployeeFormData>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: {
      email: "",
      password: "",
      displayName: "",
    },
  });

  const onSubmit = async (data: CreateEmployeeFormData) => {
    setIsLoading(true);

    try {
      const response = await fetch('/api/admin/create-employee', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        const result = await response.json();
        setCreatedEmployees(prev => [...prev, data.email]);
        form.reset();
        toast({
          title: "Employee account created",
          description: `Account for ${data.email} has been created successfully.`,
        });
      } else {
        const error = await response.json();
        toast({
          title: "Error creating account",
          description: error.message || "Failed to create employee account",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create employee account",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Create Employee Account
          </CardTitle>
          <CardDescription>
            Create employee accounts. They will use these credentials to log in to the employee workspace.
            The password will be temporary and they will be prompted to change it on first login.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employee Email</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input 
                          placeholder="employee@restaurant.com" 
                          className="pl-10"
                          data-testid="input-employee-email"
                          {...field} 
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input 
                          placeholder="John Doe" 
                          className="pl-10"
                          data-testid="input-employee-name"
                          {...field} 
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Temporary Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input 
                          type="password" 
                          placeholder="Temporary password (min 6 characters)"
                          className="pl-10"
                          data-testid="input-employee-password"
                          {...field} 
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button 
                type="submit" 
                disabled={isLoading}
                data-testid="button-create-employee"
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Employee Account
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {createdEmployees.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recently Created Accounts</CardTitle>
            <CardDescription>
              Employees can now log in using their email and the password you provided.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {createdEmployees.map((email, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-green-900/30 rounded-lg">
                  <span className="font-medium">{email}</span>
                  <Badge variant="outline" className="bg-green-900/30 text-green-400 border-green-800">
                    Account Created
                  </Badge>
                </div>
              ))}
            </div>
            <Alert className="mt-4">
              <AlertDescription>
                <strong>Instructions for employees:</strong>
                <br />
                1. Go to the main application URL
                <br />
                2. Enter their email and the password you provided
                <br />
                3. They will see their employee dashboard and workspace
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}
    </div>
  );
}