import { useEffect, useState } from 'react';
import { CalendarDays, Car, Users } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { formatDateTimeWib } from '../lib/utils.ts';
import { Driver, Vehicle } from '../../shared/types.ts';
import { EnrichedBookingForPdf } from '../lib/pdfExport.ts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { StatusLabel } from '../components/ui/status-label.tsx';

export function BookingCalendarPage({ view = 'vehicles' }: { view?: 'vehicles' | 'drivers' }) {
  const [events, setEvents] = useState<EnrichedBookingForPdf[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiRequest<{ events: EnrichedBookingForPdf[] }>('/api/bookings/calendar'),
      apiRequest<{ vehicles: Vehicle[] }>('/api/vehicles'),
      apiRequest<{ drivers: Driver[] }>('/api/drivers'),
    ])
      .then(([eRes, vRes, dRes]) => {
        setEvents(eRes.events);
        setVehicles(vRes.vehicles);
        setDrivers(dRes.drivers);
      })
      .catch(() => {
        // Handled globally on 401 or safely ignored on empty load
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">Memuat jadwal...</div>;
  }

  return (
    <div className="space-y-6">
      {view === 'vehicles' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {vehicles.map((v) => {
            const unitEvents = events.filter((e) => e.allocated_vehicle_ids.includes(v.vehicle_id));
            return (
              <Card key={v.vehicle_id}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Car className="h-4 w-4 text-[#1755CE]" />
                      {v.plate_number} — {v.vehicle_name}
                    </CardTitle>
                    <CardDescription>{v.passenger_capacity} kursi · {v.parking_location}</CardDescription>
                  </div>
                  <StatusLabel status={v.safety_blocked ? 'Diblokir' : v.eligibility_status} />
                </CardHeader>
                <CardContent className="p-0">
                  {unitEvents.length === 0 ? (
                    <div className="p-5 text-xs text-slate-500">
                      Belum ada pemesanan terjadwal untuk unit ini.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {unitEvents.map((ev) => (
                        <div key={ev.booking_id} className="p-4 flex items-start justify-between gap-3">
                          <div>
                            <div className="text-xs font-semibold text-slate-900">
                              {ev.booking_number} · {ev.activity_name}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {ev.destination_location} · PIC: {ev.pic_name}
                            </div>
                            <div className="text-[11px] text-[#1755CE] mt-1 tabular-nums flex items-center gap-1">
                              <CalendarDays className="h-3 w-3" />
                              {formatDateTimeWib(ev.departure_at)} — {formatDateTimeWib(ev.return_at)}
                            </div>
                          </div>
                          <StatusLabel status={ev.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {drivers.map((d) => {
            const drvEvents = events.filter((e) => e.allocated_driver_ids.includes(d.driver_id));
            return (
              <Card key={d.driver_id}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-[#1755CE]" />
                      {d.full_name} ({d.internal_id})
                    </CardTitle>
                    <CardDescription>
                      {d.sim_type} (Berlaku s/d {d.sim_expiry}) · {d.phone}
                    </CardDescription>
                  </div>
                  <StatusLabel status={d.active_status} />
                </CardHeader>
                <CardContent className="p-0">
                  {drvEvents.length === 0 ? (
                    <div className="p-5 text-xs text-slate-500">
                      Tidak ada penugasan terjadwal saat ini.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {drvEvents.map((ev) => (
                        <div key={ev.booking_id} className="p-4 flex items-start justify-between gap-3">
                          <div>
                            <div className="text-xs font-semibold text-slate-900">
                              {ev.booking_number} · {ev.activity_name}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              Unit:{' '}
                              {ev.allocated_vehicles_summary?.map((x) => x.plate_number).join(', ') || '-'} ·{' '}
                              {ev.destination_location}
                            </div>
                            <div className="text-[11px] text-[#1755CE] mt-1 tabular-nums">
                              {formatDateTimeWib(ev.departure_at)} — {formatDateTimeWib(ev.return_at)}
                            </div>
                          </div>
                          <StatusLabel status={ev.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
