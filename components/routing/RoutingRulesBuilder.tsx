
'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Trash2, Plus } from 'lucide-react';
import type { RoutingFormSchema } from './RoutingFormBuilder';

export interface RoutingRule {
  questionId: string;
  operator: 'equals' | 'contains' | 'includes';
  value: string;
  assignTo: string;
}

export interface RoutingRules {
  rules: RoutingRule[];
}

interface RoutingRulesBuilderProps {
  value: RoutingRules;
  onChange: (rules: RoutingRules) => void;
  formSchema: RoutingFormSchema;
  teamMembers: Array<{ id: string; name: string; email: string }>;
}

export function RoutingRulesBuilder({ value, onChange, formSchema, teamMembers }: RoutingRulesBuilderProps) {
  const [rules, setRules] = useState<RoutingRule[]>(value.rules || []);

  const addRule = () => {
    const newRule: RoutingRule = {
      questionId: formSchema.questions[0]?.id || '',
      operator: 'equals',
      value: '',
      assignTo: teamMembers[0]?.id || '',
    };
    const updated = [...rules, newRule];
    setRules(updated);
    onChange({ rules: updated });
  };

  const updateRule = (index: number, updates: Partial<RoutingRule>) => {
    const updated = [...rules];
    updated[index] = { ...updated[index], ...updates };
    setRules(updated);
    onChange({ rules: updated });
  };

  const removeRule = (index: number) => {
    const updated = rules.filter((_, i) => i !== index);
    setRules(updated);
    onChange({ rules: updated });
  };

  if (!formSchema.questions.length) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground text-center">
          Please add questions to the routing form first
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        <p>Define manual routing rules to automatically assign bookings to specific team members.</p>
        <p className="mt-1">Rules are evaluated in order and the first match wins.</p>
      </div>

      {rules.map((rule, index) => (
        <Card key={index} className="p-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Rule {index + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeRule(index)}
                className="ml-auto text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">If answer to</Label>
                <Select
                  value={rule.questionId}
                  onValueChange={(questionId) => updateRule(index, { questionId })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {formSchema.questions.map((q) => (
                      <SelectItem key={q.id} value={q.id}>
                        {q.text || 'Untitled Question'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Operator</Label>
                <Select
                  value={rule.operator}
                  onValueChange={(operator: any) => updateRule(index, { operator })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">Equals</SelectItem>
                    <SelectItem value="contains">Contains</SelectItem>
                    <SelectItem value="includes">Includes (for multi-select)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Value</Label>
                <Input
                  value={rule.value}
                  onChange={(e) => updateRule(index, { value: e.target.value })}
                  placeholder="Expected answer"
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Assign to</Label>
                <Select
                  value={rule.assignTo}
                  onValueChange={(assignTo) => updateRule(index, { assignTo })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {teamMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name || member.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </Card>
      ))}

      <Button type="button" variant="outline" onClick={addRule} className="w-full">
        <Plus className="h-4 w-4 mr-2" />
        Add Rule
      </Button>
    </div>
  );
}
