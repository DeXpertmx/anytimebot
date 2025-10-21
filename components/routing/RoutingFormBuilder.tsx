
'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Trash2, Plus, GripVertical } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

export interface RoutingQuestion {
  id: string;
  text: string;
  type: 'text' | 'multiple_choice' | 'dropdown' | 'checkboxes';
  options?: string[];
  required: boolean;
}

export interface RoutingFormSchema {
  questions: RoutingQuestion[];
}

interface RoutingFormBuilderProps {
  value: RoutingFormSchema;
  onChange: (schema: RoutingFormSchema) => void;
}

export function RoutingFormBuilder({ value, onChange }: RoutingFormBuilderProps) {
  const [questions, setQuestions] = useState<RoutingQuestion[]>(value.questions || []);

  const addQuestion = () => {
    const newQuestion: RoutingQuestion = {
      id: `q${Date.now()}`,
      text: '',
      type: 'text',
      required: false,
    };
    const updated = [...questions, newQuestion];
    setQuestions(updated);
    onChange({ questions: updated });
  };

  const updateQuestion = (index: number, updates: Partial<RoutingQuestion>) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], ...updates };
    setQuestions(updated);
    onChange({ questions: updated });
  };

  const removeQuestion = (index: number) => {
    const updated = questions.filter((_, i) => i !== index);
    setQuestions(updated);
    onChange({ questions: updated });
  };

  const addOption = (index: number) => {
    const updated = [...questions];
    const options = updated[index].options || [];
    updated[index].options = [...options, ''];
    setQuestions(updated);
    onChange({ questions: updated });
  };

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    const updated = [...questions];
    const options = [...(updated[questionIndex].options || [])];
    options[optionIndex] = value;
    updated[questionIndex].options = options;
    setQuestions(updated);
    onChange({ questions: updated });
  };

  const removeOption = (questionIndex: number, optionIndex: number) => {
    const updated = [...questions];
    const options = (updated[questionIndex].options || []).filter((_, i) => i !== optionIndex);
    updated[questionIndex].options = options;
    setQuestions(updated);
    onChange({ questions: updated });
  };

  return (
    <div className="space-y-4">
      {questions.map((question, index) => (
        <Card key={question.id} className="p-4">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="mt-2 cursor-move text-muted-foreground">
                <GripVertical className="h-5 w-5" />
              </div>
              <div className="flex-1 space-y-4">
                <div>
                  <Label>Question {index + 1}</Label>
                  <Input
                    value={question.text}
                    onChange={(e) => updateQuestion(index, { text: e.target.value })}
                    placeholder="What is your main request?"
                    className="mt-1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Field Type</Label>
                    <Select
                      value={question.type}
                      onValueChange={(type: any) => updateQuestion(index, { type })}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Short Text</SelectItem>
                        <SelectItem value="multiple_choice">Multiple Choice (Radio)</SelectItem>
                        <SelectItem value="dropdown">Dropdown</SelectItem>
                        <SelectItem value="checkboxes">Checkboxes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2 pt-8">
                    <Switch
                      checked={question.required}
                      onCheckedChange={(required) => updateQuestion(index, { required })}
                    />
                    <Label className="text-sm">Required</Label>
                  </div>
                </div>

                {(question.type === 'multiple_choice' || 
                  question.type === 'dropdown' || 
                  question.type === 'checkboxes') && (
                  <div className="space-y-2">
                    <Label className="text-sm">Options</Label>
                    {(question.options || []).map((option, optionIndex) => (
                      <div key={optionIndex} className="flex items-center gap-2">
                        <Input
                          value={option}
                          onChange={(e) => updateOption(index, optionIndex, e.target.value)}
                          placeholder={`Option ${optionIndex + 1}`}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeOption(index, optionIndex)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addOption(index)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Option
                    </Button>
                  </div>
                )}
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeQuestion(index)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      ))}

      <Button type="button" variant="outline" onClick={addQuestion} className="w-full">
        <Plus className="h-4 w-4 mr-2" />
        Add Question
      </Button>
    </div>
  );
}
