'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/lib/i18n/hooks';
// Types only: the API payloads are shared with the route, so the dialog and the
// 409 body cannot drift apart.
import type {
  CreateConflictPayload,
  EmailConflictPayload,
  MergePreviewPayload,
  PhoneConflictPayload,
} from '@/lib/crm-merge';
import { PHONE_ALREADY_EXISTS } from '@/lib/crm-merge';
import { ImageUploader } from '@/components/ui/image-uploader';
import {
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Mail,
  Merge,
  Phone,
  Search,
  Star,
  Tag,
  Trash2,
  UserPlus,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';

interface Customer {
  id: string;
  email: string;
  name?: string | null;
  company?: string | null;
  phone?: string | null;
  photo?: string | null;
  notes?: string | null;
  tags: string[];
  createdAt?: string | null;
  totalBookings: number;
  confirmedBookings: number;
  lastBookingAt?: string | null;
}

interface HistoryItem {
  id: string;
  guestName: string;
  startTime: string;
  status: string;
  eventType: { name: string };
}

interface FeedbackItem {
  id: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  eventTypeName: string;
  startTime: string;
}

type MergeFieldKey = 'name' | 'company' | 'phone' | 'photo';

/** Preview of what merging a duplicate group keeps, with the source contact. */
type MergePreview = MergePreviewPayload;

interface DuplicateGroup {
  email: string;
  contacts: Customer[];
  suggestedPrimaryId: string;
  preview: MergePreview;
  count: number;
  totalBookings: number;
  confirmedBookings: number;
  lastBookingAt?: string | null;
}

/**
 * Payload the API returns with a 409 when the email being typed already belongs
 * to another contact: both cards plus the preview of what merging them keeps.
 */
type EmailConflict = EmailConflictPayload;

/**
 * Payload the API returns with a 409 when the phone being typed already belongs
 * to another contact. `preview` is only present while editing (both cards are
 * stored); when a brand-new contact triggers it the cards are shown instead.
 */
type PhoneConflict = PhoneConflictPayload;

/** 409 payload while adding a contact by hand onto an email/phone already used. */
type CreateConflict = CreateConflictPayload;

type Translator = ReturnType<typeof useTranslation>['t'];

/**
 * "Result after merging" block: every kept value with the card it comes from.
 * Shared by the duplicate-group dialog and the email-change dialog.
 */
function MergeResultBlock({
  preview,
  chosenId,
  label,
  t,
}: {
  preview: MergePreview;
  chosenId: string;
  label: (contactId: string) => string;
  t: Translator;
}) {
  return (
    <div className="rounded-md bg-gray-50 p-3 text-sm dark:bg-gray-900/60">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {t('crm.duplicatesResult')}
      </p>
      <ul className="mt-1.5 space-y-1">
        {(['name', 'company', 'phone'] as MergeFieldKey[]).map((key) => {
          const field = preview.fields[key];
          return (
            <li key={key} className="flex flex-wrap items-baseline gap-x-2 text-gray-700 dark:text-gray-300">
              <span className="text-gray-500 dark:text-gray-400">{t(`crm.${key}`)}:</span>
              <span className={field.value ? 'font-medium' : 'text-gray-400'}>
                {field.value || t('crm.duplicatesEmpty')}
              </span>
              {field.fromId && field.fromId !== chosenId && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {t('crm.duplicatesFrom', { name: label(field.fromId) })}
                </span>
              )}
            </li>
          );
        })}
        <li className="flex flex-wrap items-baseline gap-x-2 text-gray-700 dark:text-gray-300">
          <span className="text-gray-500 dark:text-gray-400">{t('crm.tags')}:</span>
          <span className="flex flex-wrap gap-1">
            {preview.tags.length === 0 ? (
              <span className="text-gray-400">{t('crm.duplicatesEmpty')}</span>
            ) : (
              preview.tags.map((item) => (
                <span
                  key={item.tag}
                  className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                >
                  {item.tag}
                  {item.fromIds.length > 1 && <span className="text-amber-500">+{item.fromIds.length - 1}</span>}
                </span>
              ))
            )}
          </span>
        </li>
        <li className="text-gray-700 dark:text-gray-300">
          <span className="text-gray-500 dark:text-gray-400">{t('crm.notes')}:</span>{' '}
          {preview.notes.length === 0 ? (
            <span className="text-gray-400">{t('crm.duplicatesEmpty')}</span>
          ) : (
            <span className="font-medium">
              {t('crm.duplicatesNotesKept', { count: preview.notes.length })}
            </span>
          )}
        </li>
        {preview.marketingOptOut && (
          <li className="text-xs font-medium text-amber-700 dark:text-amber-300">
            {t('crm.duplicatesOptOut')}
          </li>
        )}
      </ul>
    </div>
  );
}

export function CustomersList() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<{ name: string; count: number }[]>([]);
  const [editing, setEditing] = useState<Customer | null>(null);
  /** True while the dialog adds a contact by hand (no card behind it yet). */
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    photo: '',
    notes: '',
    tags: [] as string[],
  });
  const [tagInput, setTagInput] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [feedbackSummary, setFeedbackSummary] = useState<{ total: number; average: number } | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [phoneDuplicates, setPhoneDuplicates] = useState<DuplicateGroup[]>([]);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const [primaryChoice, setPrimaryChoice] = useState<Record<string, string>>({});
  const [merging, setMerging] = useState<string | null>(null);
  /** Set when the edited email already belongs to another contact. */
  const [emailConflict, setEmailConflict] = useState<EmailConflict | null>(null);
  /** Set when the edited phone already belongs to another contact. */
  const [phoneConflict, setPhoneConflict] = useState<PhoneConflict | null>(null);
  /** Set when a hand-typed contact lands on an email/phone that already exists. */
  const [createConflict, setCreateConflict] = useState<CreateConflict | null>(null);
  /** Existing card the hand-typed data would be added to. */
  const [createTargetId, setCreateTargetId] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();

  const fetchCustomers = useCallback(async (q = '', tag: string | null = activeTag) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (tag) params.set('tag', tag);
      const response = await fetch(`/api/customers?${params.toString()}`);
      const data = await response.json();
      if (data.success) {
        setCustomers(data.data);
      } else {
        toast({
          title: t('common.error'),
          description: t('crm.saveFailed'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('crm.saveFailed'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, activeTag]);

  const fetchTags = useCallback(async () => {
    try {
      const response = await fetch('/api/customers?tags=1');
      const data = await response.json();
      if (data.success) setAvailableTags(data.data);
    } catch (error) {
      // silent
    }
  }, []);

  const fetchDuplicates = useCallback(async () => {
    try {
      const response = await fetch('/api/customers/duplicates');
      const data = await response.json();
      if (data.success) {
        setDuplicates(data.data);
        setPhoneDuplicates(data.phoneGroups || []);
      }
    } catch (error) {
      // silent: the banner is an aid, never a blocker
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
    fetchTags();
    fetchDuplicates();
  }, [fetchCustomers, fetchTags, fetchDuplicates]);

  useEffect(() => {
    const timer = setTimeout(() => fetchCustomers(query), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, activeTag]);

  const selectTag = (tag: string | null) => {
    setActiveTag(tag);
  };

  const exportCsv = () => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (activeTag) params.set('tag', activeTag);
    const qs = params.toString();
    window.open(`/api/customers/export${qs ? `?${qs}` : ''}`, '_blank');
  };

  const openEdit = (customer: Customer) => {
    setCreating(false);
    setEditing(customer);
    setEmailConflict(null);
    setPhoneConflict(null);
    setCreateConflict(null);
    setForm({
      name: customer.name || '',
      email: customer.email || '',
      company: customer.company || '',
      phone: customer.phone || '',
      photo: customer.photo || '',
      notes: customer.notes || '',
      tags: [...customer.tags],
    });
    setTagInput('');
  };

  /** Add a contact by hand: a walk-in, a phone call, a referral. */
  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setEmailConflict(null);
    setPhoneConflict(null);
    setCreateConflict(null);
    setCreateTargetId(null);
    setForm({ name: '', email: '', company: '', phone: '', photo: '', notes: '', tags: [] });
    setTagInput('');
  };

  const closeForm = () => {
    setEditing(null);
    setCreating(false);
    setEmailConflict(null);
    setPhoneConflict(null);
    setCreateConflict(null);
    setCreateTargetId(null);
  };

  const addTag = () => {
    const value = tagInput.trim().toLowerCase();
    if (value && !form.tags.includes(value)) {
      setForm({ ...form, tags: [...form.tags, value].slice(0, 20) });
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setForm({ ...form, tags: form.tags.filter((item) => item !== tag) });
  };

  /** Merge a phone group: the owner confirmed both cards are the same person. */
  const mergePhoneGroup = async (group: DuplicateGroup) => {
    setMerging(group.email);
    try {
      const response = await fetch('/api/customers/duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: group.email,
          primaryId: primaryChoice[group.email] || group.suggestedPrimaryId,
          kind: 'phone',
        }),
      });
      const data = await response.json();
      if (data.success) {
        toast({
          title: t('common.success'),
          description: t('crm.duplicatesMerged', { count: data.data.merged }),
        });
        setPhoneDuplicates((prev) => {
          const next = prev.filter((item) => item.email !== group.email);
          if (next.length === 0 && duplicates.length === 0) setDuplicatesOpen(false);
          return next;
        });
        fetchCustomers(query);
        fetchTags();
      } else {
        toast({
          title: t('common.error'),
          description: data.error || t('crm.duplicatesMergeFailed'),
          variant: 'destructive',
        });
        fetchDuplicates();
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('crm.duplicatesMergeFailed'),
        variant: 'destructive',
      });
    } finally {
      setMerging(null);
    }
  };

  /**
   * Save the form — POST when adding a contact, PATCH when editing — optionally
   * asking the API to merge/adopt on conflict.
   */
  const postSave = async (extra: Record<string, unknown>) => {
    if (!editing && !creating) return null;
    const response = await fetch(creating ? '/api/customers' : `/api/customers/${editing!.id}`, {
      method: creating ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, ...extra }),
    });
    return { response, data: await response.json() };
  };

  const handleSave = async () => {
    if (!editing && !creating) return;
    setSaving(true);
    try {
      const result = await postSave({});
      if (!result) return;
      const { response, data } = result;

      // The address or the number is taken: offer to fold the cards instead of
      // refusing the save (on creation, offer to add the data to that card).
      if (response.status === 409 && data.conflict) {
        if (data.error === PHONE_ALREADY_EXISTS) {
          if (creating) {
            setCreateConflict(data.conflict as CreateConflict);
            setCreateTargetId((data.conflict as CreateConflict).suggestedPrimaryId);
          } else {
            setPhoneConflict(data.conflict as PhoneConflict);
          }
        } else if (creating) {
          setCreateConflict(data.conflict as CreateConflict);
          setCreateTargetId((data.conflict as CreateConflict).suggestedPrimaryId);
        } else {
          setEmailConflict(data.conflict as EmailConflict);
        }
        return;
      }

      if (data.success) {
        toast({
          title: t('common.success'),
          description: creating ? t('crm.created') : t('crm.saved'),
        });
        closeForm();
        fetchCustomers(query);
        fetchTags();
        fetchDuplicates();
      } else {
        toast({
          title: t('common.error'),
          description: data.error || t('crm.saveFailed'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('crm.saveFailed'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Switch which card keeps its identity: the API recomputes the preview (the
   * conflicting request is a dry run, so nothing is written yet).
   */
  const chooseConflictPrimary = async (primaryId: string) => {
    if (!editing || !emailConflict || primaryId === emailConflict.preview.primaryId) return;
    setPreviewLoading(true);
    try {
      const result = await postSave({ primaryId });
      if (result && result.response.status === 409 && result.data.conflict) {
        setEmailConflict(result.data.conflict as EmailConflict);
      }
    } catch (error) {
      // keep the previous preview
    } finally {
      setPreviewLoading(false);
    }
  };

  /** Same dry run for a phone conflict: the preview follows the chosen card. */
  const choosePhoneConflictPrimary = async (primaryId: string) => {
    if (!editing || !phoneConflict || primaryId === phoneConflict.preview?.primaryId) return;
    setPreviewLoading(true);
    try {
      const result = await postSave({ primaryId });
      if (result && result.response.status === 409 && result.data.conflict) {
        setPhoneConflict(result.data.conflict as PhoneConflict);
      }
    } catch (error) {
      // keep the previous preview
    } finally {
      setPreviewLoading(false);
    }
  };

  /** Confirm the merge: save the edits and collapse both cards into one. */
  const handleMergeConflict = async () => {
    if (!editing || !emailConflict) return;
    setSaving(true);
    try {
      const result = await postSave({
        mergeOnConflict: true,
        primaryId: emailConflict.preview.primaryId,
      });
      if (!result) return;
      const { data } = result;

      if (data.success) {
        toast({ title: t('common.success'), description: t('crm.emailConflictMerged') });
        setEmailConflict(null);
        closeForm();
        fetchCustomers(query);
        fetchTags();
        fetchDuplicates();
      } else {
        toast({
          title: t('common.error'),
          description: data.error || t('crm.duplicatesMergeFailed'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('crm.duplicatesMergeFailed'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Confirm a phone merge: fold the cards that share the number into the chosen
   * one. The survivor keeps its own address, so the save also carries the rest
   * of the edits (they were part of the dry run that raised the conflict).
   */
  const handlePhoneMerge = async () => {
    if (!editing || !phoneConflict) return;
    setSaving(true);
    try {
      const result = await postSave({
        mergePhoneOnConflict: true,
        primaryId: phoneConflict.preview?.primaryId,
      });
      if (!result) return;
      const { data } = result;

      if (data.success) {
        toast({
          title: t('common.success'),
          description: t('crm.phoneConflictMerged', { phone: phoneConflict.phone }),
        });
        closeForm();
        fetchCustomers(query);
        fetchTags();
        fetchDuplicates();
      } else {
        toast({
          title: t('common.error'),
          description: data.error || t('crm.duplicatesMergeFailed'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('crm.duplicatesMergeFailed'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  /** Save the card with the shared number, without merging anyone. */
  const handlePhoneKeep = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const result = await postSave({ sharedPhoneConfirmed: true });
      if (!result) return;
      const { data } = result;

      if (data.success) {
        toast({ title: t('common.success'), description: t('crm.phoneConflictKept') });
        closeForm();
        fetchCustomers(query);
        fetchTags();
        fetchDuplicates();
      } else {
        toast({
          title: t('common.error'),
          description: data.error || t('crm.saveFailed'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('crm.saveFailed'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  /**
   * New contact whose email/phone already exists: add the typed values to the
   * chosen card instead of creating a second one for the same person.
   */
  const handleCreateJoin = async () => {
    if (!creating || !createConflict) return;
    setSaving(true);
    try {
      const result = await postSave({
        mergeOnConflict: createConflict.kind === 'email',
        mergePhoneOnConflict: createConflict.kind === 'phone',
        primaryId: createTargetId || createConflict.suggestedPrimaryId,
      });
      if (!result) return;
      const { data } = result;

      if (data.success) {
        toast({ title: t('common.success'), description: t('crm.createConflictJoined') });
        closeForm();
        fetchCustomers(query);
        fetchTags();
        fetchDuplicates();
      } else {
        toast({
          title: t('common.error'),
          description: data.error || t('crm.saveFailed'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('crm.saveFailed'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  /** Create the card anyway: a shared number may be two different people. */
  const handleCreateAnyway = async () => {
    if (!creating) return;
    setSaving(true);
    try {
      const result = await postSave({ sharedPhoneConfirmed: true });
      if (!result) return;
      const { data } = result;

      if (data.success) {
        toast({ title: t('common.success'), description: t('crm.created') });
        closeForm();
        fetchCustomers(query);
        fetchTags();
        fetchDuplicates();
      } else {
        toast({
          title: t('common.error'),
          description: data.error || t('crm.saveFailed'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('crm.saveFailed'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Merge one duplicate group into a single contact (survivor = the choice).
   * Email groups collapse to one address; phone groups fold the cards the user
   * confirmed are the same person while the survivor keeps its own email.
   */
  const mergeGroup = async (group: DuplicateGroup) => {
    setMerging(group.email);
    try {
      const response = await fetch('/api/customers/duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: group.email,
          primaryId: primaryChoice[group.email] || group.suggestedPrimaryId,
        }),
      });
      const data = await response.json();
      if (data.success) {
        toast({
          title: t('common.success'),
          description: t('crm.duplicatesMerged', { count: data.data.merged }),
        });
        setDuplicates((prev) => {
          const next = prev.filter((item) => item.email !== group.email);
          if (next.length === 0 && phoneDuplicates.length === 0) setDuplicatesOpen(false);
          return next;
        });
        setPhoneDuplicates((prev) => {
          const next = prev.filter((item) => item.email !== group.email);
          if (next.length === 0 && duplicates.length === 0) setDuplicatesOpen(false);
          return next;
        });
        fetchCustomers(query);
        fetchTags();
      } else {
        toast({
          title: t('common.error'),
          description: data.error || t('crm.duplicatesMergeFailed'),
          variant: 'destructive',
        });
        fetchDuplicates();
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('crm.duplicatesMergeFailed'),
        variant: 'destructive',
      });
    } finally {
      setMerging(null);
    }
  };

  const handleDelete = async (customer: Customer) => {
    if (!confirm(t('crm.deleteConfirm'))) return;
    try {
      const response = await fetch(`/api/customers/${customer.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (data.success) {
        toast({ title: t('common.success'), description: t('crm.deleted') });
        fetchCustomers(query);
        fetchTags();
      } else {
        toast({
          title: t('common.error'),
          description: t('crm.deleteFailed'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('crm.deleteFailed'),
        variant: 'destructive',
      });
    }
  };

  const toggleHistory = async (customer: Customer) => {
    if (expanded === customer.id) {
      setExpanded(null);
      return;
    }
    setExpanded(customer.id);
    setHistory([]);
    setHistoryLoading(true);
    setFeedbacks([]);
    setFeedbackSummary(null);
    setFeedbackLoading(true);
    try {
      const response = await fetch(`/api/bookings?guestEmail=${encodeURIComponent(customer.email)}&limit=20&status=all`);
      const data = await response.json();
      if (data.success) setHistory(data.data.bookings);
    } catch (error) {
      // silent
    } finally {
      setHistoryLoading(false);
    }
    try {
      const response = await fetch(`/api/customers/${customer.id}/feedback`);
      const data = await response.json();
      if (data.success) {
        setFeedbacks(data.data.feedbacks);
        setFeedbackSummary(data.data.summary);
      }
    } catch (error) {
      // silent
    } finally {
      setFeedbackLoading(false);
    }
  };

  const initials = (customer: Customer) =>
    (customer.name?.[0] || customer.email[0] || '?').toUpperCase();

  const formatDate = (value?: string | null) =>
    value
      ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-md flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('crm.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} className="shrink-0">
          <Download className="mr-2 h-4 w-4" />
          {t('crm.exportCsv')}
        </Button>
        <Button
          size="sm"
          onClick={openCreate}
          className="shrink-0 bg-indigo-600 hover:bg-indigo-700"
        >
          <UserPlus className="mr-2 h-4 w-4" />
          {t('crm.addCustomer')}
        </Button>
      </div>

      {availableTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-gray-500">{t('crm.segments')}:</span>
          <button
            type="button"
            onClick={() => selectTag(null)}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              activeTag === null
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t('crm.allCustomers')}
          </button>
          {availableTags.map(({ name, count }) => (
            <button
              key={name}
              type="button"
              onClick={() => selectTag(name)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                activeTag === name
                  ? 'bg-indigo-600 text-white'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              <Tag className="h-3 w-3" />
              {name}
              <span className={activeTag === name ? 'text-indigo-200' : 'text-amber-500'}>
                ({count})
              </span>
            </button>
          ))}
        </div>
      )}

      {(duplicates.length > 0 || phoneDuplicates.length > 0) && (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-start gap-3">
              <UsersRound className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-medium text-amber-900 dark:text-amber-200">
                  {t('crm.duplicatesTitle', { count: duplicates.length + phoneDuplicates.length })}
                </p>
                <p className="text-sm text-amber-800/90 dark:text-amber-300/90">
                  {duplicates.length > 0 ? t('crm.duplicatesDesc') : t('crm.duplicatesDescPhone')}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 border-amber-400 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950"
              onClick={() => setDuplicatesOpen(true)}
            >
              <Merge className="mr-2 h-4 w-4" />
              {t('crm.duplicatesReview')}
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('crm.loading')}
        </div>
      ) : customers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <UserRound className="h-16 w-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">{t('crm.empty')}</h3>
            <p className="text-gray-500 text-center max-w-sm">{t('crm.emptyDesc')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {customers.map((customer) => (
            <Card key={customer.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-indigo-100 text-indigo-600 font-semibold">
                      {customer.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={customer.photo} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center">{initials(customer)}</div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {customer.name || customer.email}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 mt-0.5">
                        <span className="flex items-center gap-1 truncate">
                          <Mail className="h-3.5 w-3.5" />
                          {customer.email}
                        </span>
                        {customer.company && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5" />
                            {customer.company}
                          </span>
                        )}
                        {customer.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5" />
                            {customer.phone}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
                          <CalendarDays className="h-3 w-3" />
                          {t('crm.totalBookings', { count: customer.totalBookings })}
                        </span>
                        <span className="text-gray-500">
                          {customer.lastBookingAt
                            ? t('crm.lastBooking', { date: formatDate(customer.lastBookingAt) })
                            : t('crm.never')}
                        </span>
                        {customer.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700"
                          >
                            <Tag className="h-3 w-3" />
                            {tag}
                          </span>
                        ))}
                      </div>
                      {customer.notes && (
                        <p className="mt-2 line-clamp-2 text-sm text-gray-600">{customer.notes}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => toggleHistory(customer)}>
                      {expanded === customer.id ? (
                        <ChevronUp className="mr-1 h-4 w-4" />
                      ) : (
                        <ChevronDown className="mr-1 h-4 w-4" />
                      )}
                      {t('crm.history')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openEdit(customer)}>
                      {t('crm.edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDelete(customer)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {expanded === customer.id && (
                  <div className="mt-4 space-y-3 border-t pt-3">
                    {/* Customer feedback */}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        {t('crm.customerFeedback')}
                      </p>
                      {feedbackLoading ? (
                        <div className="mt-1.5 flex items-center gap-2 text-sm text-gray-500">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t('crm.loading')}
                        </div>
                      ) : !feedbackSummary || feedbackSummary.total === 0 ? (
                        <p className="mt-1.5 text-sm text-gray-500">{t('crm.feedbackEmpty')}</p>
                      ) : (
                        <>
                          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-gray-700">
                            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                            <span className="font-semibold">{feedbackSummary.average}</span>
                            <span className="text-gray-500">
                              · {t('crm.feedbackCount', { count: feedbackSummary.total })}
                            </span>
                          </p>
                          <ul className="mt-1.5 space-y-1.5">
                            {feedbacks.map((item) => (
                              <li
                                key={item.id}
                                className="rounded-md bg-amber-50/60 px-3 py-1.5 text-sm"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="flex items-center gap-0.5">
                                    {Array.from({ length: 5 }, (_, i) => (
                                      <Star
                                        key={i}
                                        className={`h-3 w-3 ${
                                          i < item.rating
                                            ? 'fill-amber-400 text-amber-400'
                                            : 'text-gray-300'
                                        }`}
                                      />
                                    ))}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {item.eventTypeName} ·{' '}
                                    {new Date(item.startTime).toLocaleDateString(undefined, {
                                      day: 'numeric',
                                      month: 'short',
                                      year: 'numeric',
                                    })}
                                  </span>
                                </div>
                                {item.comment && (
                                  <p className="mt-1 text-gray-700">“{item.comment}”</p>
                                )}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>

                    {/* Booking history */}
                    <div>
                    {historyLoading ? (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('crm.loading')}
                      </div>
                    ) : history.length === 0 ? (
                      <p className="text-sm text-gray-500">{t('crm.historyEmpty')}</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {history.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-1.5 text-sm"
                          >
                            <span className="font-medium text-gray-800">{item.eventType.name}</span>
                            <span className="text-gray-600">
                              {new Date(item.startTime).toLocaleString(undefined, {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            <Badge variant={item.status === 'CONFIRMED' ? 'default' : 'secondary'}>
                              {item.status}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Duplicate contacts: review and merge, one group at a time */}
      <Dialog open={duplicatesOpen} onOpenChange={setDuplicatesOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('crm.duplicatesDialogTitle')}</DialogTitle>
          </DialogHeader>
          {duplicates.length > 0 && (
            <p className="-mt-1 text-sm text-gray-600 dark:text-gray-400">
              {t('crm.duplicatesDialogDesc')}
            </p>
          )}

          <div className="space-y-4">
            {duplicates.map((group) => {
              const chosen = primaryChoice[group.email] || group.suggestedPrimaryId;
              const label = (contactId: string) => {
                const contact = group.contacts.find((item) => item.id === contactId);
                return contact?.name || contact?.email || '—';
              };
              return (
                <div
                  key={group.email}
                  className="rounded-lg border border-gray-200 p-3 dark:border-gray-800"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{group.email}</p>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {t('crm.totalBookings', { count: group.totalBookings })}
                    </span>
                  </div>

                  {/* Which contact keeps its identity */}
                  <div className="mt-3 space-y-2">
                    {group.contacts.map((contact) => (
                      <label
                        key={contact.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-md border p-2.5 transition-colors ${
                          chosen === contact.id
                            ? 'border-indigo-400 bg-indigo-50/60 dark:border-indigo-700 dark:bg-indigo-950/40'
                            : 'border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900/60'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`primary-${group.email}`}
                          className="mt-1"
                          checked={chosen === contact.id}
                          onChange={() =>
                            setPrimaryChoice((prev) => ({ ...prev, [group.email]: contact.id }))
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                            {contact.name || t('crm.duplicatesNoName')}
                          </p>
                          <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                            {contact.email}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
                            {contact.company && (
                              <span className="flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                {contact.company}
                              </span>
                            )}
                            {contact.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {contact.phone}
                              </span>
                            )}
                            <span>
                              {t('crm.duplicatesCreatedAt', { date: formatDate(contact.createdAt) || '' })}
                            </span>
                          </div>
                          {contact.tags.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {contact.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                                >
                                  <Tag className="h-3 w-3" />
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          {contact.notes && (
                            <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                              {contact.notes}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                          {chosen === contact.id ? t('crm.duplicatesKeeping') : ''}
                        </span>
                      </label>
                    ))}
                  </div>

                  {/* What the merged contact keeps */}
                  <div className="mt-3">
                    <MergeResultBlock
                      preview={group.preview}
                      chosenId={chosen}
                      label={label}
                      t={t}
                    />
                  </div>

                  <div className="mt-3 flex justify-end">
                    <Button
                      size="sm"
                      className="bg-indigo-600 hover:bg-indigo-700"
                      disabled={merging === group.email}
                      onClick={() => mergeGroup(group)}
                    >
                      {merging === group.email ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Merge className="mr-2 h-4 w-4" />
                      )}
                      {t('crm.duplicatesMerge', { count: group.count })}
                    </Button>
                  </div>
                </div>
              );
            })}

            {/* Same phone: advisory groups, merged only on confirmation */}
            {phoneDuplicates.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-t pt-3">
                  <Phone className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {t('crm.duplicatesPhoneSection')}
                  </p>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('crm.duplicatesPhoneDesc')}
                </p>
                {phoneDuplicates.map((group) => {
                  const chosen = primaryChoice[group.email] || group.suggestedPrimaryId;
                  const label = (contactId: string) => {
                    const contact = group.contacts.find((item) => item.id === contactId);
                    return contact?.name || contact?.email || '—';
                  };
                  return (
                    <div
                      key={group.email}
                      className="rounded-lg border border-gray-200 p-3 dark:border-gray-800"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
                          <Phone className="h-3.5 w-3.5" />
                          {group.contacts.find((c) => c.phone)?.phone || group.email}
                        </p>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {t('crm.totalBookings', { count: group.totalBookings })}
                        </span>
                      </div>

                      <div className="mt-3 space-y-2">
                        {group.contacts.map((contact) => (
                          <label
                            key={contact.id}
                            className={`flex cursor-pointer items-start gap-3 rounded-md border p-2.5 transition-colors ${
                              chosen === contact.id
                                ? 'border-indigo-400 bg-indigo-50/60 dark:border-indigo-700 dark:bg-indigo-950/40'
                                : 'border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900/60'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`phone-primary-${group.email}`}
                              className="mt-1"
                              checked={chosen === contact.id}
                              onChange={() =>
                                setPrimaryChoice((prev) => ({ ...prev, [group.email]: contact.id }))
                              }
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                                {contact.name || t('crm.duplicatesNoName')}
                              </p>
                              <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                {contact.email}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
                                {contact.company && <span>{contact.company}</span>}
                                <span>
                                  {t('crm.duplicatesCreatedAt', {
                                    date: formatDate(contact.createdAt) || '',
                                  })}
                                </span>
                              </div>
                            </div>
                            <span className="shrink-0 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                              {chosen === contact.id ? t('crm.duplicatesKeeping') : ''}
                            </span>
                          </label>
                        ))}
                      </div>

                      <div className="mt-3">
                        <MergeResultBlock
                          preview={group.preview}
                          chosenId={chosen}
                          label={label}
                          t={t}
                        />
                      </div>

                      <div className="mt-3 flex justify-end">
                        <Button
                          size="sm"
                          className="bg-indigo-600 hover:bg-indigo-700"
                          disabled={merging === group.email}
                          onClick={() => mergePhoneGroup(group)}
                        >
                          {merging === group.email ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Merge className="mr-2 h-4 w-4" />
                          )}
                          {t('crm.duplicatesPhoneMerge', { count: group.count })}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicatesOpen(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editing || creating}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
      >
        <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {emailConflict
                ? t('crm.emailConflictTitle')
                : phoneConflict
                  ? t('crm.phoneConflictTitle')
                  : createConflict
                    ? t('crm.createConflictTitle')
                    : creating
                      ? t('crm.createTitle')
                      : t('crm.editTitle')}
            </DialogTitle>
          </DialogHeader>

          {/* The typed address belongs to another card: merge instead of refusing */}
          {emailConflict && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/40">
                <Merge className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <p className="text-sm text-amber-900 dark:text-amber-200">
                  {t('crm.emailConflictDesc', { email: emailConflict.email })}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {t('crm.emailConflictChoose')}
                </p>
                {emailConflict.contacts.map((contact, index) => {
                  const chosen = emailConflict.preview.primaryId === contact.id;
                  return (
                    <label
                      key={contact.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-md border p-2.5 transition-colors ${
                        chosen
                          ? 'border-indigo-400 bg-indigo-50/60 dark:border-indigo-700 dark:bg-indigo-950/40'
                          : 'border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900/60'
                      }`}
                    >
                      <input
                        type="radio"
                        name="conflict-primary"
                        className="mt-1"
                        checked={chosen}
                        disabled={saving || previewLoading}
                        onChange={() => chooseConflictPrimary(contact.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                          {contact.name || t('crm.duplicatesNoName')}
                        </p>
                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                          {contact.historyEmail}
                          {contact.historyEmail !== contact.email && (
                            <span className="font-medium text-indigo-600 dark:text-indigo-400">
                              {' → '}
                              {contact.email}
                            </span>
                          )}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
                          {contact.company && <span>{contact.company}</span>}
                          {contact.phone && <span>{contact.phone}</span>}
                          <span>
                            {t('crm.duplicatesCreatedAt', {
                              date: formatDate(contact.createdAt) || '',
                            })}
                          </span>
                          <span>{t('crm.totalBookings', { count: contact.totalBookings })}</span>
                        </div>
                        <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                          {index === 0 ? t('crm.emailConflictCurrent') : t('crm.emailConflictExisting')}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                        {chosen ? t('crm.duplicatesKeeping') : ''}
                      </span>
                    </label>
                  );
                })}
              </div>

              {previewLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('crm.loading')}
                </div>
              ) : (
                <MergeResultBlock
                  preview={emailConflict.preview}
                  chosenId={emailConflict.preview.primaryId}
                  label={(contactId) => {
                    const contact = emailConflict.contacts.find((item) => item.id === contactId);
                    return contact?.name || contact?.email || '—';
                  }}
                  t={t}
                />
              )}
            </div>
          )}

          {/* The number is shared with another card: same offer as the email */}
          {phoneConflict && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/40">
                <Phone className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <p className="text-sm text-amber-900 dark:text-amber-200">
                  {t('crm.phoneConflictDesc', { phone: phoneConflict.phone })}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {t('crm.emailConflictChoose')}
                </p>
                {phoneConflict.contacts.map((contact, index) => {
                  const chosen = phoneConflict.preview?.primaryId === contact.id;
                  return (
                    <label
                      key={contact.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-md border p-2.5 transition-colors ${
                        chosen
                          ? 'border-indigo-400 bg-indigo-50/60 dark:border-indigo-700 dark:bg-indigo-950/40'
                          : 'border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900/60'
                      }`}
                    >
                      <input
                        type="radio"
                        name="phone-conflict-primary"
                        className="mt-1"
                        checked={chosen}
                        disabled={saving || previewLoading}
                        onChange={() => choosePhoneConflictPrimary(contact.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                          {contact.name || t('crm.duplicatesNoName')}
                        </p>
                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                          {contact.email}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
                          {contact.company && <span>{contact.company}</span>}
                          {contact.phone && <span>{contact.phone}</span>}
                          <span>
                            {t('crm.duplicatesCreatedAt', {
                              date: formatDate(contact.createdAt) || '',
                            })}
                          </span>
                          <span>{t('crm.totalBookings', { count: contact.totalBookings })}</span>
                        </div>
                        <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                          {index === 0 ? t('crm.emailConflictCurrent') : t('crm.emailConflictExisting')}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                        {chosen ? t('crm.duplicatesKeeping') : ''}
                      </span>
                    </label>
                  );
                })}
              </div>

              {previewLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('crm.loading')}
                </div>
              ) : phoneConflict.preview ? (
                <MergeResultBlock
                  preview={phoneConflict.preview}
                  chosenId={phoneConflict.preview.primaryId}
                  label={(contactId) => {
                    const contact = phoneConflict.contacts.find((item) => item.id === contactId);
                    return contact?.name || contact?.email || '—';
                  }}
                  t={t}
                />
              ) : null}
            </div>
          )}

          {/* New contact landing on an email/number that already exists */}
          {createConflict && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/40">
                {createConflict.kind === 'email' ? (
                  <Mail className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                ) : (
                  <Phone className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                )}
                <p className="text-sm text-amber-900 dark:text-amber-200">
                  {createConflict.kind === 'email'
                    ? t('crm.createConflictEmailDesc', { email: createConflict.key })
                    : t('crm.createConflictPhoneDesc', { phone: createConflict.key })}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {createConflict.kind === 'email'
                    ? t('crm.createConflictChooseEmail')
                    : t('crm.createConflictChoosePhone')}
                </p>
                {createConflict.contacts.map((contact) => {
                  const chosen =
                    (createTargetId || createConflict.suggestedPrimaryId) === contact.id;
                  return (
                    <label
                      key={contact.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-md border p-2.5 transition-colors ${
                        chosen
                          ? 'border-indigo-400 bg-indigo-50/60 dark:border-indigo-700 dark:bg-indigo-950/40'
                          : 'border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900/60'
                      }`}
                    >
                      <input
                        type="radio"
                        name="create-conflict-target"
                        className="mt-1"
                        checked={chosen}
                        disabled={saving}
                        onChange={() => setCreateTargetId(contact.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                          {contact.name || t('crm.duplicatesNoName')}
                        </p>
                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                          {contact.email}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
                          {contact.company && <span>{contact.company}</span>}
                          {contact.phone && <span>{contact.phone}</span>}
                          <span>
                            {t('crm.duplicatesCreatedAt', {
                              date: formatDate(contact.createdAt) || '',
                            })}
                          </span>
                          <span>{t('crm.totalBookings', { count: contact.totalBookings })}</span>
                        </div>
                        {contact.notes && (
                          <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                            {contact.notes}
                          </p>
                        )}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {contact.tags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="shrink-0 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                        {chosen ? t('crm.duplicatesKeeping') : ''}
                      </span>
                    </label>
                  );
                })}
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                {createConflict.kind === 'email'
                  ? t('crm.createConflictEmailKept')
                  : t('crm.createConflictPhoneKept')}
              </p>
            </div>
          )}

          {!emailConflict && !phoneConflict && !createConflict && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customer-photo">{t('crm.photo')}</Label>
              {creating ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('crm.photoAfterSave')}
                </p>
              ) : (
                <ImageUploader
                  value={form.photo}
                  onChange={(photo) => setForm({ ...form, photo })}
                  uploadUrl="/api/uploads/customer-photo"
                  round
                  beforeUpload={(fd) => {
                    if (editing) fd.append('customerId', editing.id);
                  }}
                />
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="customer-name">{t('crm.name')}</Label>
                <Input
                  id="customer-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-company">{t('crm.company')}</Label>
                <Input
                  id="customer-company"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-email">{t('crm.email')}</Label>
              <Input
                id="customer-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-phone">{t('crm.phone')}</Label>
              <Input
                id="customer-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-notes">{t('crm.notes')}</Label>
              <Textarea
                id="customer-notes"
                rows={4}
                placeholder={t('crm.notesPlaceholder')}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-tags">{t('crm.tags')}</Label>
              <div className="flex flex-wrap gap-1.5">
                {form.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                  >
                    <Tag className="h-3 w-3" />
                    {tag}
                    <button
                      type="button"
                      aria-label={`${t('common.delete')} ${tag}`}
                      onClick={() => removeTag(tag)}
                      className="ml-0.5 text-amber-500 hover:text-amber-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  id="customer-tags"
                  value={tagInput}
                  placeholder={t('crm.tagsPlaceholder')}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={addTag}>
                  {t('common.next')}
                </Button>
              </div>
            </div>
          </div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            {emailConflict ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setEmailConflict(null)}
                  disabled={saving}
                >
                  {t('crm.emailConflictBack')}
                </Button>
                <Button
                  onClick={handleMergeConflict}
                  disabled={saving || previewLoading}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Merge className="mr-2 h-4 w-4" />
                  )}
                  {t('crm.emailConflictMerge')}
                </Button>
              </>
            ) : phoneConflict ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setPhoneConflict(null)}
                  disabled={saving}
                >
                  {t('crm.emailConflictBack')}
                </Button>
                <Button
                  variant="outline"
                  onClick={handlePhoneKeep}
                  disabled={saving || previewLoading}
                >
                  {t('crm.phoneConflictKeep')}
                </Button>
                <Button
                  onClick={handlePhoneMerge}
                  disabled={saving || previewLoading}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Merge className="mr-2 h-4 w-4" />
                  )}
                  {t('crm.phoneConflictMerge')}
                </Button>
              </>
            ) : createConflict ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setCreateConflict(null)}
                  disabled={saving}
                >
                  {t('crm.emailConflictBack')}
                </Button>
                {createConflict.kind === 'phone' && (
                  <Button
                    variant="outline"
                    onClick={handleCreateAnyway}
                    disabled={saving}
                  >
                    {t('crm.createConflictAnyway')}
                  </Button>
                )}
                <Button
                  onClick={handleCreateJoin}
                  disabled={saving}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Merge className="mr-2 h-4 w-4" />
                  )}
                  {t('crm.createConflictJoin')}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={closeForm}>
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t('common.save')}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
