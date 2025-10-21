
'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { RoutingFormSchema } from './RoutingFormBuilder';

interface RoutingFormDisplayProps {
  schema: RoutingFormSchema;
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
  errors?: Record<string, string>;
}

export function RoutingFormDisplay({ schema, values, onChange, errors = {} }: RoutingFormDisplayProps) {
  const handleChange = (questionId: string, value: any) => {
    onChange({ ...values, [questionId]: value });
  };

  const handleCheckboxChange = (questionId: string, option: string, checked: boolean) => {
    const currentValues = values[questionId] || [];
    const newValues = checked
      ? [...currentValues, option]
      : currentValues.filter((v: string) => v !== option);
    onChange({ ...values, [questionId]: newValues });
  };

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold">Qualification Form</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Please answer these questions to help us assign the right team member
          </p>
        </div>

        {schema.questions.map((question, index) => (
          <div key={question.id} className="space-y-2">
            <Label>
              {index + 1}. {question.text}
              {question.required && <span className="text-destructive ml-1">*</span>}
            </Label>

            {question.type === 'text' && (
              <Input
                value={values[question.id] || ''}
                onChange={(e) => handleChange(question.id, e.target.value)}
                placeholder="Your answer"
                className={errors[question.id] ? 'border-destructive' : ''}
              />
            )}

            {question.type === 'multiple_choice' && (
              <RadioGroup
                value={values[question.id] || ''}
                onValueChange={(value) => handleChange(question.id, value)}
              >
                {(question.options || []).map((option, optionIndex) => (
                  <div key={optionIndex} className="flex items-center space-x-2">
                    <RadioGroupItem value={option} id={`${question.id}-${optionIndex}`} />
                    <Label htmlFor={`${question.id}-${optionIndex}`} className="font-normal">
                      {option}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}

            {question.type === 'dropdown' && (
              <Select
                value={values[question.id] || ''}
                onValueChange={(value) => handleChange(question.id, value)}
              >
                <SelectTrigger className={errors[question.id] ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {(question.options || []).map((option, optionIndex) => (
                    <SelectItem key={optionIndex} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {question.type === 'checkboxes' && (
              <div className="space-y-2">
                {(question.options || []).map((option, optionIndex) => {
                  const isChecked = (values[question.id] || []).includes(option);
                  return (
                    <div key={optionIndex} className="flex items-center space-x-2">
                      <Checkbox
                        id={`${question.id}-${optionIndex}`}
                        checked={isChecked}
                        onCheckedChange={(checked) => 
                          handleCheckboxChange(question.id, option, checked as boolean)
                        }
                      />
                      <Label htmlFor={`${question.id}-${optionIndex}`} className="font-normal">
                        {option}
                      </Label>
                    </div>
                  );
                })}
              </div>
            )}

            {errors[question.id] && (
              <p className="text-sm text-destructive">{errors[question.id]}</p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
