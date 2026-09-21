import React, { useCallback, useEffect, useState } from 'react';
import { Headphones, PhoneCall, Plus, Users } from 'lucide-react';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { studentsApi } from '@/services/studentsApi';

const CallsSection = ({ onJoinRoom, embedded = false }) => {
  const { toast } = useToast();
  const [rooms, setRooms] = useState([]);
  const [committees, setCommittees] = useState([]);
  const [canCreate, setCanCreate] = useState(false);
  const [committeeSelectionLocked, setCommitteeSelectionLocked] = useState(false);
  const [livekitConfigured, setLivekitConfigured] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({ name: '', committeeId: '' });

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setIsLoading(true);
    try {
      const data = await studentsApi.getCallRooms();
      setRooms((data.rooms || []).filter((room) => room.status === 'open'));
      setCommittees(data.committees || []);
      setCanCreate(Boolean(data.canCreate));
      setCommitteeSelectionLocked(Boolean(data.committeeSelectionLocked));
      setLivekitConfigured(data.livekitConfigured !== false);
      setForm((current) => ({ ...current, committeeId: current.committeeId || String(data.committees?.[0]?.id || '') }));
    } catch (error) {
      if (!quiet) toast({ title: 'تعذر تحميل الغرف', description: error.message, variant: 'destructive' });
    } finally {
      if (!quiet) setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load({ quiet: true }), 10000);
    return () => window.clearInterval(timer);
  }, [load]);

  const createRoom = async () => {
    if (!form.name.trim() || (committeeSelectionLocked && !form.committeeId)) return;
    setIsSaving(true);
    try {
      await studentsApi.createCallRoom(
        committeeSelectionLocked ? { name: form.name } : form
      );
      setCreateOpen(false);
      setForm((current) => ({ ...current, name: '' }));
      await load();
      toast({ title: 'تم إنشاء غرفة المكالمة' });
    } catch (error) {
      toast({ title: 'تعذر إنشاء الغرفة', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const Container = embedded ? 'section' : Card;
  const Content = embedded ? 'div' : CardContent;
  return (
    <Container className={embedded ? '[font-family:var(--font-ui)]' : 'border-primary/30 bg-card neon-glow'} dir="rtl">
      {(!embedded || canCreate) && <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b border-primary/20">
        {!embedded && <h2 className="text-xl font-black text-foreground sm:text-2xl">المكالمات</h2>}
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)} disabled={!livekitConfigured || (committeeSelectionLocked && committees.length === 0)} className="gap-2">
            <Plus className="h-4 w-4" /> إنشاء غرفة
          </Button>
        )}
      </CardHeader>}
      <Content className={embedded ? '' : 'pt-4 sm:pt-6'}>
        {isLoading ? <DashboardLoader className="min-h-[320px]" /> : rooms.length === 0 ? (
          <div className={embedded ? 'py-10 text-center text-sm text-muted-foreground' : 'rounded-lg border border-dashed border-primary/25 p-10 text-center font-bold text-muted-foreground'}>لا توجد غرف مفتوحة حاليًا.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rooms.map((room) => (
              <Card key={room.id} className="flex min-h-52 flex-col border-primary/20 bg-background/60 shadow-sm">
                <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-black text-foreground">{room.name}</h3>
                    <p className="mt-1 truncate text-sm font-bold text-primary">{room.committeeName}</p>
                  </div>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Headphones className="h-5 w-5" /></span>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between">
                  <div className="space-y-2 text-sm font-bold text-muted-foreground">
                    <div>أنشأها: {room.createdByName}</div>
                    <div className="flex items-center gap-2"><Users className="h-4 w-4" /> المشاركون: {room.participantNames?.length || 0}</div>
                  </div>
                  <Button onClick={() => onJoinRoom?.(room)} disabled={!livekitConfigured} className="mt-5 w-full gap-2"><PhoneCall className="h-4 w-4" /> دخول المكالمة</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Content>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card text-foreground" dir="rtl">
          <DialogHeader><DialogTitle>إنشاء غرفة مكالمة</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2"><Label>اسم الغرفة</Label><Input aria-label="اسم الغرفة" value={form.name} maxLength={180} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="مثال: تسميع المجموعة الأولى" /></div>
            {!committeeSelectionLocked && committees.length > 0 && <div className="space-y-2"><Label>الحلقة</Label><Select value={form.committeeId} onValueChange={(value) => setForm({ ...form, committeeId: value })}><SelectTrigger aria-label="الحلقة"><SelectValue placeholder="غرفة عامة" /></SelectTrigger><SelectContent>{committees.map((committee) => <SelectItem key={committee.id} value={String(committee.id)}>{committee.name}</SelectItem>)}</SelectContent></Select></div>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button><Button onClick={createRoom} disabled={isSaving || !form.name.trim() || (committeeSelectionLocked && !form.committeeId)}>إنشاء</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Container>
  );
};

export default CallsSection;
