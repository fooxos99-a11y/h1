import React, { useEffect, useState } from 'react';
import SettingsGroup from './SettingsGroup';
import MessageTemplateField, { TemplateVariablesHint } from './MessageTemplateField';
import SettingToggle, { ToggleSwitch } from '@/components/ui/setting-toggle';
import MultiSelectSetting from '@/components/ui/multi-select-setting';
import { Label } from '@/components/ui/label';
import { studentsApi } from '@/services/studentsApi';
import { eventNotificationDefinitions, normalizeEventNotifications } from '../../../shared/event-notifications.js';

export default function NotificationSettings({settings,setSettings,executionReminderStudents,toggleListValue}) {
  const [administrators,setAdministrators]=useState([]);
  const [error,setError]=useState('');
  useEffect(()=>{let active=true;studentsApi.getNotificationAdministrators().then(people=>{if(active)setAdministrators(people);}).catch(()=>{if(active)setError('تعذر تحميل الإداريين. أعد فتح الصفحة.');});return()=>{active=false;};},[]);
  const config=normalizeEventNotifications(settings.eventNotifications);
  const update=(key,patch)=>setSettings({...settings,eventNotifications:{...config,[key]:{...config[key],...patch}}});
  return <>
    <SettingsGroup>
      {eventNotificationDefinitions.map(def=><div key={def.key} className="space-y-3">
        <SettingToggle label={def.label} checked={config[def.key].enabled} onCheckedChange={enabled=>update(def.key,{enabled})}/>
        {config[def.key].enabled && <>
          <MessageTemplateField id={'notification-'+def.key} label="قالب الإشعار" value={config[def.key].template} onChange={template=>update(def.key,{template})} placeholder={def.template}/>
          {def.key==='storeOrder' && <div className="space-y-2"><Label>الإداريون المستلمون</Label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <MultiSelectSetting value={config.storeOrder.administrators} options={administrators.map(person=>({value:person.id,label:person.name}))} placeholder="اختر الإداريين" onToggle={id=>update('storeOrder',{administrators:config.storeOrder.administrators.includes(Number(id))?config.storeOrder.administrators.filter(value=>value!==Number(id)):[...config.storeOrder.administrators,Number(id)]})}/>
          </div>}
        </>}
      </div>)}
    </SettingsGroup>
          <SettingsGroup>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-black text-primary">قوالب التحضير والتنفيذ</h3>
              <TemplateVariablesHint />
            </div>
            <div className="space-y-5">
              <MessageTemplateField
                id="attendance-absent-template"
                label="قالب رسالة الغياب"
                value={settings.attendanceAbsentTemplate || ''}
                onChange={(value) => setSettings({ ...settings, attendanceAbsentTemplate: value })}
                placeholder="استخدم {name} و {date} و {committee}"
                action={(
                  <ToggleSwitch
                    ariaLabel="الإرسال التلقائي لرسالة الغياب"
                    checked={settings.automaticAbsenceMessageEnabled}
                    onCheckedChange={(checked) => setSettings({
                      ...settings,
                      automaticAbsenceMessageEnabled: checked,
                    })}
                  />
                )}
              />

              {[
                settings.memorizationExecutionSource,
                settings.reviewExecutionSource,
                settings.linkExecutionSource,
              ]
                .some((source) => ['student', 'both'].includes(source)) && (
                <>
                  <MessageTemplateField
                    id="execution-reminder-template"
                    label="قالب رسالة عدم التنفيذ"
                    value={settings.executionReminderTemplate || ''}
                    onChange={(value) => setSettings({ ...settings, executionReminderTemplate: value })}
                    placeholder="استخدم {name} و {date} و {tasks}"
                    action={(
                      <ToggleSwitch
                        ariaLabel="الإرسال التلقائي لرسالة عدم التنفيذ"
                        checked={settings.automaticExecutionMessageEnabled}
                        onCheckedChange={(checked) => setSettings({
                          ...settings,
                          automaticExecutionMessageEnabled: checked,
                        })}
                      />
                    )}
                  />
                  <div className="space-y-2">
                    <Label>استثناء طلاب</Label>
                    <MultiSelectSetting
                      value={settings.executionReminderExcludedStudentIds || []}
                      options={executionReminderStudents.map((student) => ({
                        value: student.id,
                        label: student.committeeName
                          ? `${student.name} — ${student.committeeName}`
                          : student.name,
                      }))}
                      placeholder="اختر الطلاب المستثنين من رسالة عدم التنفيذ"
                      onToggle={(studentId) => toggleListValue('executionReminderExcludedStudentIds', studentId)}
                    />
                  </div>
                </>
              )}
            </div>
          </SettingsGroup>
          <SettingsGroup>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-black text-primary">قوالب يوم السرد والاختبار</h3>
              <TemplateVariablesHint />
            </div>
            <div className="space-y-5">
              <MessageTemplateField
                id="quran-test-message-template"
                label="قالب موعد الاختبار"
                value={settings.quranTestMessageTemplate || ''}
                onChange={(value) => setSettings({ ...settings, quranTestMessageTemplate: value })}
                placeholder="استخدم {name} و {juz} و {date}"
              />
              <MessageTemplateField id="narration-start-template" label="قالب بداية يوم السرد" value={settings.narrationStartTemplate || ''} onChange={(value) => setSettings({ ...settings, narrationStartTemplate: value })} />
              <MessageTemplateField id="narration-end-template" label="قالب نهاية يوم السرد" value={settings.narrationEndTemplate || ''} onChange={(value) => setSettings({ ...settings, narrationEndTemplate: value })} />
              <MessageTemplateField id="narration-result-template" label="قالب نتيجة يوم السرد" value={settings.narrationResultTemplate || ''} onChange={(value) => setSettings({ ...settings, narrationResultTemplate: value })} />
            </div>
          </SettingsGroup>
    <SettingsGroup><h3 className="text-sm font-black text-primary">قوالب التسجيل</h3>
    {[
      ['registrationPreAcceptTemplate','القبول المبدئي'],['registrationAcceptTemplate','قبول التسجيل'],['registrationRejectTemplate','رفض التسجيل'],
    ].map(([key,label])=><MessageTemplateField key={key} id={key} label={label} value={settings[key]||''} onChange={value=>setSettings({...settings,[key]:value})}/>)}
    </SettingsGroup>
  </>;
}
