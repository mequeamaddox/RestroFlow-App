import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle } from 'lucide-react';

// Signature pad component (simplified for now - will enhance later)
function SignaturePad({ onSignatureChange, value }: { onSignatureChange: (signature: string) => void; value?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = value;
    }
  }, [value]);

  const startDrawing = (e: React.MouseEvent) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const signature = canvas.toDataURL();
    onSignatureChange(signature);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onSignatureChange('');
  };

  return (
    <div className="space-y-2">
      <div className="border border-slate-700 rounded-lg p-4 bg-slate-800">
        <canvas
          ref={canvasRef}
          width={400}
          height={150}
          className="border bg-card rounded cursor-crosshair w-full"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          data-testid="signature-canvas"
        />
      </div>
      <div className="flex justify-between">
        <p className="text-sm text-muted-foreground">Sign your name in the box above</p>
        <Button 
          type="button" 
          variant="outline" 
          size="sm" 
          onClick={clearSignature}
          data-testid="button-clear-signature"
        >
          Clear
        </Button>
      </div>
    </div>
  );
}

interface DigitalDocumentFormProps {
  assignmentId: string;
  templateId: string;
  templateName: string;
  userId: string;
  onComplete: () => void;
}

export function DigitalDocumentForm({ assignmentId, templateId, templateName, userId, onComplete }: DigitalDocumentFormProps) {
  const { toast } = useToast();

  // Fetch form fields for this template
  const { data: formFields = [], isLoading: fieldsLoading } = useQuery<any[]>({
    queryKey: [`/api/document-templates/${templateId}/fields`],
  });

  // Fetch existing responses
  const { data: existingResponses = [] } = useQuery<any[]>({
    queryKey: [`/api/employee-documents/${assignmentId}/responses`],
  });

  // Create dynamic form schema based on form fields
  const createFormSchema = (fields: any[] = []) => {
    const schema: Record<string, any> = {};
    fields.forEach((field: any) => {
      let fieldSchema: any;
      
      if (field.fieldType === 'email') {
        fieldSchema = field.isRequired 
          ? z.string().email('Please enter a valid email address').min(1, `${field.fieldLabel} is required`)
          : z.string().email('Please enter a valid email address').optional();
      } else if (field.fieldType === 'number') {
        fieldSchema = field.isRequired
          ? z.coerce.number().min(0, `${field.fieldLabel} is required`)
          : z.coerce.number().optional();
      } else {
        fieldSchema = field.isRequired
          ? z.string().min(1, `${field.fieldLabel} is required`)
          : z.string().optional();
      }
      
      schema[field.fieldName] = fieldSchema;
    });
    return z.object(schema);
  };

  const formSchema = createFormSchema(formFields);

  // Initialize form with existing responses
  const getDefaultValues = () => {
    const defaults: Record<string, any> = {};
    if (existingResponses && formFields) {
      formFields.forEach((field: any) => {
        const response = existingResponses.find((r: any) => r.fieldId === field.id);
        defaults[field.fieldName] = response?.fieldValue || '';
      });
    }
    return defaults;
  };

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: getDefaultValues(),
  });

  // Reset form when data loads
  useEffect(() => {
    if (existingResponses && formFields) {
      form.reset(getDefaultValues());
    }
  }, [existingResponses, formFields, form]);

  // Save response mutation
  const saveResponseMutation = useMutation({
    mutationFn: async (data: { fieldId: string; fieldValue: string }) => {
      return await apiRequest('POST', `/api/employee-documents/${assignmentId}/responses`, data);
    },
  });

  // Complete document mutation
  const completeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', `/api/employee-documents/${assignmentId}/complete`);
    },
    onSuccess: () => {
      toast({
        title: "Document Completed",
        description: "Your document has been completed successfully!",
      });
      // Invalidate the specific employee documents query to refresh the UI
      queryClient.invalidateQueries({ queryKey: [`/api/employees/${userId}/documents`] });
      onComplete();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to complete document. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Auto-save responses as user types
  const handleFieldChange = async (fieldName: string, value: string) => {
    const field = formFields?.find((f: any) => f.fieldName === fieldName);
    if (field) {
      try {
        await saveResponseMutation.mutateAsync({
          fieldId: field.id,
          fieldValue: value,
        });
      } catch (error) {
        console.error('Failed to save response:', error);
      }
    }
  };

  const handleSubmit = async (data: any) => {
    // Save all responses before completing
    if (formFields) {
      for (const field of formFields) {
        const value = data[field.fieldName];
        if (value) {
          await handleFieldChange(field.fieldName, value.toString());
        }
      }
    }
    
    // Mark document as completed
    completeMutation.mutate();
  };

  const renderField = (field: any) => {
    const commonProps = {
      disabled: completeMutation.isPending,
    };

    switch (field.fieldType) {
      case 'text':
      case 'email':
        return (
          <FormField
            key={field.id}
            control={form.control}
            name={field.fieldName}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>{field.fieldLabel} {field.isRequired && '*'}</FormLabel>
                <FormControl>
                  <Input
                    {...formField}
                    placeholder={field.placeholder}
                    type={field.fieldType === 'email' ? 'email' : 'text'}
                    onBlur={() => handleFieldChange(field.fieldName, formField.value)}
                    data-testid={`input-${field.fieldName}`}
                    {...commonProps}
                  />
                </FormControl>
                {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'textarea':
        return (
          <FormField
            key={field.id}
            control={form.control}
            name={field.fieldName}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>{field.fieldLabel} {field.isRequired && '*'}</FormLabel>
                <FormControl>
                  <Textarea
                    {...formField}
                    placeholder={field.placeholder}
                    onBlur={() => handleFieldChange(field.fieldName, formField.value)}
                    data-testid={`textarea-${field.fieldName}`}
                    {...commonProps}
                  />
                </FormControl>
                {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'number':
        return (
          <FormField
            key={field.id}
            control={form.control}
            name={field.fieldName}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>{field.fieldLabel} {field.isRequired && '*'}</FormLabel>
                <FormControl>
                  <Input
                    {...formField}
                    type="number"
                    placeholder={field.placeholder}
                    onBlur={() => handleFieldChange(field.fieldName, formField.value)}
                    data-testid={`input-number-${field.fieldName}`}
                    {...commonProps}
                  />
                </FormControl>
                {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'date':
        return (
          <FormField
            key={field.id}
            control={form.control}
            name={field.fieldName}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>{field.fieldLabel} {field.isRequired && '*'}</FormLabel>
                <FormControl>
                  <Input
                    {...formField}
                    type="date"
                    onBlur={() => handleFieldChange(field.fieldName, formField.value)}
                    data-testid={`input-date-${field.fieldName}`}
                    {...commonProps}
                  />
                </FormControl>
                {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'select':
        return (
          <FormField
            key={field.id}
            control={form.control}
            name={field.fieldName}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>{field.fieldLabel} {field.isRequired && '*'}</FormLabel>
                <Select 
                  onValueChange={(value) => {
                    formField.onChange(value);
                    handleFieldChange(field.fieldName, value);
                  }}
                  value={formField.value}
                  disabled={commonProps.disabled}
                >
                  <FormControl>
                    <SelectTrigger data-testid={`select-${field.fieldName}`}>
                      <SelectValue placeholder={field.placeholder || `Select ${field.fieldLabel}`} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {field.options?.map((option: string, index: number) => (
                      <SelectItem key={index} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'checkbox':
        return (
          <FormField
            key={field.id}
            control={form.control}
            name={field.fieldName}
            render={({ field: formField }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={formField.value === 'true' || formField.value === true}
                    onCheckedChange={(checked) => {
                      const value = checked ? 'true' : 'false';
                      formField.onChange(value);
                      handleFieldChange(field.fieldName, value);
                    }}
                    disabled={commonProps.disabled}
                    data-testid={`checkbox-${field.fieldName}`}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>{field.fieldLabel} {field.isRequired && '*'}</FormLabel>
                  {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        );

      case 'signature':
        return (
          <FormField
            key={field.id}
            control={form.control}
            name={field.fieldName}
            render={({ field: formField }) => (
              <FormItem>
                <FormLabel>{field.fieldLabel} {field.isRequired && '*'}</FormLabel>
                <FormControl>
                  <SignaturePad
                    value={formField.value}
                    onSignatureChange={(signature) => {
                      formField.onChange(signature);
                      handleFieldChange(field.fieldName, signature);
                    }}
                  />
                </FormControl>
                {field.helpText && <FormDescription>{field.helpText}</FormDescription>}
                <FormMessage />
              </FormItem>
            )}
          />
        );

      default:
        return null;
    }
  };

  if (fieldsLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2">Loading form...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!formFields || formFields.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center py-8">
            <CheckCircle className="h-16 w-16 mx-auto mb-4 text-green-500" />
            <h3 className="text-lg font-medium text-foreground mb-2">No Form Required</h3>
            <p className="text-muted-foreground">This document doesn't require any form completion.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Complete {templateName}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {formFields.map((field: any) => renderField(field))}
            
            <div className="flex justify-end pt-6 border-t">
              <Button
                type="submit"
                disabled={completeMutation.isPending}
                data-testid="button-complete-form"
                className="min-w-[120px]"
              >
                {completeMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Completing...
                  </>
                ) : (
                  'Complete Document'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}