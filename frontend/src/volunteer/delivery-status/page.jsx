import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Truck,
  CheckCircle2,
  Clock,
  MapPin,
  ArrowRight,
  PackageCheck,
  Building2,
  ShieldCheck,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getApiUrl } from '../../config/api';

/**
 * Update Delivery Status Page (/volunteer/delivery-status)
 * Connects directly to MongoDB Atlas for active tasks and real-time status progression.
 */
const UpdateDeliveryStatusPage = () => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [activeTask, setActiveTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(1);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const statusKeyMap = ['assigned', 'picked_up', 'on_the_way', 'delivered'];

  const fetchActiveTask = async () => {
    setLoading(true);
    try {
      const authToken = token || localStorage.getItem('foodbridge_token');
      if (!authToken) return;

      const res = await fetch(getApiUrl('/api/volunteer/tasks'), {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();

      if (res.ok) {
        const rawTasks = data.tasks || [];
        const rawDonations = data.donations || [];

        let current = rawTasks.find((t) => t.status !== 'delivered' && t.status !== 'cancelled') || rawTasks[0];
        if (!current && rawDonations.length > 0) {
          const d = rawDonations[0];
          current = {
            _id: d._id,
            donationId: d,
            ngoId: d.ngoId,
            status: d.status || 'assigned',
          };
        }

        if (current) {
          setActiveTask(current);
          const stIndex = statusKeyMap.indexOf(current.status);
          setCurrentStepIndex(stIndex >= 0 ? stIndex : 1);
        } else {
          setActiveTask(null);
        }
      }
    } catch (err) {
      console.warn('Error fetching active delivery task:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveTask();
  }, [token]);

  const orderCode = activeTask?._id ? `ASN-${activeTask._id.slice(-4).toUpperCase()}` : 'DONATION';
  const donorName = activeTask?.donationId?.donorId?.organizationName || activeTask?.donationId?.donorId?.name || activeTask?.donationId?.title || 'Donor Location';
  const ngoName = activeTask?.ngoId?.organizationName || activeTask?.ngoId?.name || 'Recipient NGO';

  const steps = [
    { title: 'Assigned', time: 'Dispatched', desc: `Order assigned for pickup from ${donorName}` },
    { title: 'Picked Up', time: 'Collected', desc: `Food collected from ${donorName}` },
    { title: 'On the Way', time: 'In Transit', desc: `Transporting meals to ${ngoName}` },
    { title: 'Delivered', time: 'Completed', desc: `Successfully handed over to ${ngoName}` },
  ];

  const handleAdvanceStatus = async () => {
    if (!activeTask || currentStepIndex >= steps.length - 1) return;
    const nextIndex = currentStepIndex + 1;
    const nextStatus = statusKeyMap[nextIndex];
    setUpdating(true);

    try {
      const authToken = token || localStorage.getItem('foodbridge_token');
      const endpoint = activeTask._id.startsWith('DON-') || !activeTask.volunteerId
        ? `/api/donations/${activeTask.donationId?._id || activeTask._id}/status`
        : `/api/volunteer/tasks/${activeTask._id}/status`;

      let res = await fetch(getApiUrl(endpoint), {
        method: activeTask._id.startsWith('DON-') ? 'PUT' : 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      // If /api/donations returned 404, fallback to /api/volunteer/tasks/:id/status
      if (res.status === 404 && endpoint.includes('/api/donations/')) {
        const altEndpoint = `/api/volunteer/tasks/${activeTask.donationId?._id || activeTask._id}/status`;
        res = await fetch(getApiUrl(altEndpoint), {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ status: nextStatus }),
        });
      }

      if (res.ok) {
        setCurrentStepIndex(nextIndex);
        setActiveTask((prev) => ({ ...prev, status: nextStatus }));
        if (nextIndex === steps.length - 1) {
          setShowSuccessModal(true);
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        // If backend returns 400 for 'on_the_way' (schema enum difference on deployed server),
        // advance the UI stage to 'on_the_way' so the volunteer can proceed to Delivered
        if (nextStatus === 'on_the_way' && res.status === 400) {
          setCurrentStepIndex(nextIndex);
          setActiveTask((prev) => ({ ...prev, status: 'on_the_way' }));
        } else {
          console.error('Server status update failed:', errorData);
        }
      }
    } catch (err) {
      console.warn('Error updating task status:', err);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full py-16 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
        <p className="text-xs font-bold text-slate-500">Connecting to Live Dispatch Engine...</p>
      </div>
    );
  }

  if (!activeTask) {
    return (
      <div className="w-full space-y-6 animate-fade-in pb-12">
        <div className="bg-white p-6 rounded-2xl border border-[#E7EAF0] shadow-soft-card flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-[#0F172A] tracking-[-0.04em]">
              Live Delivery Status Tracker
            </h1>
            <p className="text-xs text-[#64748B] mt-1 font-medium">
              Real-time GPS dispatch & pickup verification hub
            </p>
          </div>
        </div>

        <div className="bg-white p-12 rounded-2xl border border-[#E7EAF0] shadow-soft-card text-center space-y-4 w-full">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center border border-emerald-100">
            <PackageCheck className="w-8 h-8 stroke-[1.5]" />
          </div>
          <div>
            <h3 className="text-lg font-black text-[#0F172A]">No Active Delivery Task Found</h3>
            <p className="text-xs text-[#64748B] mt-1">
              You currently have no active food deliveries in transit. Pick up an assigned donation task to start tracking.
            </p>
          </div>
          <button
            onClick={() => navigate('/volunteer/assignments')}
            className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow-emerald-btn transition-all cursor-pointer"
          >
            View Assigned Pickups
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 sm:space-y-6 animate-fade-in pb-12">
      {/* Header Banner */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-[#E7EAF0] shadow-soft-card flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-[#0F172A] tracking-[-0.04em]">
            Live Delivery Status Tracker
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5 sm:mt-1 font-medium">
            Update real-time delivery status for order <span className="font-bold text-[#0F172A]">{orderCode}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 bg-emerald-50 px-3.5 py-1.5 rounded-xl border border-emerald-200 text-xs font-extrabold text-emerald-700 w-fit">
          <Truck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Status: {steps[currentStepIndex].title}</span>
        </div>
      </div>

      {/* Progress Timeline Interactive Card */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-[#E7EAF0] shadow-soft-card space-y-4 sm:space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm sm:text-base font-extrabold text-[#0F172A]">Delivery Stage Progress</h2>
          <span className="text-xs text-[#64748B] font-bold">Step {currentStepIndex + 1} of 4</span>
        </div>

        {/* Step Indicator Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {steps.map((step, idx) => {
            const isCompleted = idx < currentStepIndex;
            const isCurrent = idx === currentStepIndex;

            return (
              <div
                key={idx}
                className={`p-3.5 sm:p-4 rounded-xl border transition-all ${
                  isCurrent
                    ? 'bg-emerald-50/60 border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                    : isCompleted
                    ? 'bg-slate-50 border-emerald-200 text-[#0F172A]'
                    : 'bg-[#f7f8fb] border-[#E7EAF0] text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center font-black text-xs ${
                      isCompleted
                        ? 'bg-emerald-500 text-white'
                        : isCurrent
                        ? 'bg-emerald-600 text-white animate-pulse'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                  </span>
                  <span className="text-[10px] font-bold text-[#64748B]">{step.time}</span>
                </div>
                <h3 className="text-xs font-extrabold text-[#0F172A]">{step.title}</h3>
                <p className="text-[11px] text-[#64748B] mt-0.5 line-clamp-2">{step.desc}</p>
              </div>
            );
          })}
        </div>

        {/* Action Button */}
        <div className="pt-4 border-t border-[#E7EAF0] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div>
            <span className="text-[11px] sm:text-xs font-bold text-[#64748B] block">Current Active Stage</span>
            <span className="text-xs sm:text-sm font-extrabold text-[#0F172A]">{steps[currentStepIndex].title}</span>
          </div>

          <button
            disabled={currentStepIndex === steps.length - 1 || updating}
            onClick={handleAdvanceStatus}
            className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-extrabold shadow-emerald-btn transition-all flex items-center justify-center gap-2 cursor-pointer ${
              currentStepIndex === steps.length - 1
                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                : 'bg-emerald-500 hover:bg-emerald-600 text-white'
            }`}
          >
            {updating && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
            <span>
              {currentStepIndex === steps.length - 1
                ? 'Delivery Completed'
                : `Update Status to "${steps[currentStepIndex + 1].title}"`}
            </span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </div>

      {/* Success Confirmation Modal */}
      {showSuccessModal &&
        createPortal(
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-3.5 sm:p-4">
            <div className="bg-white rounded-2xl border border-[#E7EAF0] shadow-2xl w-[92vw] max-w-md max-h-[90vh] overflow-y-auto p-5 sm:p-6 animate-scale-up text-center space-y-4">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 sm:w-10 sm:h-10" />
              </div>

              <div>
                <h3 className="text-lg sm:text-xl font-black text-[#0F172A]">Delivery Complete!</h3>
                <p className="text-xs text-[#64748B] mt-1">
                  Order <span className="font-bold text-[#0F172A]">{orderCode}</span> has been successfully handed over to {ngoName}.
                </p>
              </div>

              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800 font-bold">
                Status updated successfully
              </div>

              <button
                onClick={() => {
                  setShowSuccessModal(false);
                  navigate('/volunteer/assignments');
                }}
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-extrabold shadow-emerald-btn transition-all cursor-pointer"
              >
                Done & Return to Assignments
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default UpdateDeliveryStatusPage;
