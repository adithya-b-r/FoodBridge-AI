import React, { useState, useEffect, useCallback } from 'react';
import {
  Navigation,
  MapPin,
  Building2,
  Bike,
  RefreshCw,
  ExternalLink,
  Compass,
  Clock,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Phone,
  Crosshair,
  Plus,
  Minus,
  Store,
  Camera
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getApiUrl } from '../../config/api';
import { validateCoordinates } from '../../services/routingService';
import DeliveryTrackingMap from '../../components/maps/DeliveryTrackingMap';

/**
 * Modern Logistics Navigation Page (/volunteer/navigation)
 * Inspired by Uber Driver, Porter, Zepto Fleet, and Delhivery.
 */
const NavigationPage = () => {
  const navigate = useNavigate();
  const { token, user } = useAuth();

  const [activeTask, setActiveTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentStep, setCurrentStep] = useState(2); // Step 2: Navigating

  const steps = [
    { label: 'Assigned', step: 1 },
    { label: 'Navigating', step: 2 },
    { label: 'Picked Up', step: 3 },
    { label: 'On the Way', step: 4 },
    { label: 'Delivered', step: 5 },
  ];

  const fetchTask = async () => {
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
        const current = rawTasks.find((t) => t.status !== 'delivered') || rawTasks[0];

        if (current) {
          const photo = current.pickupPhoto || current.donationId?.pickupPhoto || '';
          const isVerified = current.status === 'picked_up' || current.status === 'on_the_way' || current.status === 'delivered' || Boolean(photo);
          const donorObj = current.donationId?.donorId;
          const ngoObj = current.ngoId;
          const donLoc = current.donationId?.location;

          setActiveTask({
            mongoId: current._id,
            donationId: current.donationId,
            ngoId: current.ngoId,
            donorName: donorObj?.organizationName || donorObj?.name || 'Verified Food Donor',
            donorAddress: donorObj?.formattedAddress || donorObj?.address || donLoc?.address || 'Donor Pickup Address',
            donorPhone: donorObj?.phone || current.donationId?.donorId?.phone || '+91 98765 43210',
            donorLat: donorObj?.latitude || donorObj?.location?.lat || donLoc?.lat || 0,
            donorLng: donorObj?.longitude || donorObj?.location?.lng || donLoc?.lng || 0,
            ngoName: ngoObj?.organizationName || ngoObj?.name || 'Partner NGO Hub',
            ngoAddress: ngoObj?.formattedAddress || ngoObj?.address || 'NGO Dropoff Hub',
            ngoPhone: ngoObj?.phone || '',
            ngoLat: ngoObj?.latitude || ngoObj?.location?.lat || 0,
            ngoLng: ngoObj?.longitude || ngoObj?.location?.lng || 0,
            remainingDistance: '—',
            estimatedETA: '—',
            statusText: current.status === 'delivered'
              ? 'Delivered at NGO Hub'
              : current.status === 'on_the_way'
              ? 'In Transit to NGO'
              : isVerified
              ? 'Food Picked Up (Ready to Depart)'
              : 'Pickup Verification Pending',
            pickupPhoto: photo,
            isVerified: isVerified,
            status: current.status,
          });
          if (current.status === 'delivered') {
            setCurrentStep(5);
          } else if (current.status === 'on_the_way') {
            setCurrentStep(4);
          } else if (current.status === 'picked_up' || isVerified) {
            setCurrentStep(3);
          } else if (current.status === 'accepted') {
            setCurrentStep(2);
          } else {
            setCurrentStep(1);
          }
        } else if (rawDonations.length > 0) {
          const d = rawDonations[0];
          const photo = d.pickupPhoto || '';
          const isVerified = d.status === 'picked_up' || d.status === 'on_the_way' || d.status === 'delivered' || Boolean(photo);
          const donorObj = d.donorId;
          const ngoObj = d.ngoId;
          const donLoc = d.location;

          setActiveTask({
            mongoId: d._id,
            donationId: d,
            ngoId: d.ngoId,
            donorName: donorObj?.organizationName || donorObj?.name || 'Verified Food Donor',
            donorAddress: donorObj?.formattedAddress || donorObj?.address || donLoc?.address || 'Donor Pickup Address',
            donorPhone: donorObj?.phone || '+91 98765 43210',
            donorLat: donorObj?.latitude || donorObj?.location?.lat || donLoc?.lat || 0,
            donorLng: donorObj?.longitude || donorObj?.location?.lng || donLoc?.lng || 0,
            ngoName: ngoObj?.organizationName || ngoObj?.name || 'Partner NGO Hub',
            ngoAddress: ngoObj?.formattedAddress || ngoObj?.address || 'NGO Dropoff Hub',
            ngoPhone: ngoObj?.phone || '',
            ngoLat: ngoObj?.latitude || ngoObj?.location?.lat || 0,
            ngoLng: ngoObj?.longitude || ngoObj?.location?.lng || 0,
            remainingDistance: '—',
            estimatedETA: '—',
            statusText: d.status === 'delivered'
              ? 'Delivered at NGO Hub'
              : d.status === 'on_the_way'
              ? 'In Transit to NGO'
              : isVerified
              ? 'Food Picked Up (Ready to Depart)'
              : 'Pickup Verification Pending',
            pickupPhoto: photo,
            isVerified: isVerified,
            status: d.status,
          });
          if (d.status === 'delivered') {
            setCurrentStep(5);
          } else if (d.status === 'on_the_way') {
            setCurrentStep(4);
          } else if (d.status === 'picked_up' || isVerified) {
            setCurrentStep(3);
          } else if (d.status === 'accepted') {
            setCurrentStep(2);
          } else {
            setCurrentStep(1);
          }
        } else {
          setActiveTask(null);
        }
      }
    } catch (err) {
      console.warn('Error fetching navigation task:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTask();
  }, [token]);

  const handleRouteCalculated = useCallback(({ distance, duration, error }) => {
    if (!error && distance && duration) {
      setActiveTask((prev) => {
        if (!prev) return prev;
        if (prev.remainingDistance === distance && prev.estimatedETA === duration) return prev;
        return { ...prev, remainingDistance: distance, estimatedETA: duration };
      });
    }
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchTask();
    setTimeout(() => setIsRefreshing(false), 800);
  };

  if (loading) {
    return (
      <div className="w-full py-24 flex flex-col items-center justify-center space-y-3 bg-[#F8FAFC]">
        <Loader2 className="w-8 h-8 text-[#16A34A] animate-spin" />
        <p className="text-xs font-bold text-slate-500">Initializing OpenStreetMap GPS engine...</p>
      </div>
    );
  }

  if (!activeTask) {
    return (
      <div className="w-full space-y-6 animate-fade-in pb-12 bg-[#F8FAFC]">
        <div className="bg-white p-6 rounded-[20px] border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-[#0F172A] tracking-[-0.03em]">
              GPS Turn-by-Turn Navigation
            </h1>
            <p className="text-xs text-[#64748B] mt-1 font-medium">
              Live logistics routing connecting Courier ➔ Donor ➔ NGO
            </p>
          </div>
        </div>

        <div className="bg-white p-12 rounded-[20px] border border-slate-200/80 shadow-xs text-center space-y-4 w-full">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-[#16A34A] mx-auto flex items-center justify-center border border-emerald-100">
            <Navigation className="w-8 h-8 stroke-[1.5]" />
          </div>
          <div>
            <h3 className="text-lg font-black text-[#0F172A]">No Active Navigation Route</h3>
            <p className="text-xs text-[#64748B] mt-1">
              You currently have no active food pickups in transit. Accept an assigned pickup to view turn-by-turn navigation.
            </p>
          </div>
          <button
            onClick={() => navigate('/volunteer/assignments')}
            className="px-6 py-2.5 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
          >
            View Assigned Pickups
          </button>
        </div>
      </div>
    );
  }

  const osmMarkers = currentStep >= 3 ? [
    {
      lat: 12.9141,
      lng: 74.8560,
      title: `Volunteer Courier (${user?.name || 'You'})`,
      description: 'In Transit to NGO',
      iconType: 'courier',
    },
    {
      lat: 12.9250,
      lng: 74.8750,
      title: activeTask.ngoName,
      description: activeTask.ngoAddress,
      iconType: 'ngo',
    },
  ] : [
    {
      lat: 12.9050,
      lng: 74.8450,
      title: `Volunteer Courier (${user?.name || 'You'})`,
      description: 'Current Location',
      iconType: 'courier',
    },
    {
      lat: 12.9141,
      lng: 74.8560,
      title: activeTask.donorName,
      description: activeTask.donorAddress,
      iconType: 'donor',
    },
    {
      lat: 12.9250,
      lng: 74.8750,
      title: activeTask.ngoName,
      description: activeTask.ngoAddress,
      iconType: 'ngo',
    },
  ];

  return (
    <div className="w-full space-y-5 animate-fade-in pb-12 bg-[#F8FAFC]">
      {/* 1. Header & Stepper Section */}
      <div className="bg-white p-5 rounded-[20px] border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-[#0F172A] tracking-[-0.03em]">
              Live GPS Dispatch Navigation
            </h1>
            <p className="text-xs text-[#64748B] font-medium mt-0.5">
              Optimized logistics route for surplus food recovery
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-[#0F172A] border border-slate-200 text-xs font-bold transition-all cursor-pointer shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#16A34A] ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Stepper Progress Timeline Bar (Req 8) */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between max-w-3xl mx-auto px-2 relative">
            {/* Connecting Track Line */}
            <div className="absolute left-8 right-8 top-1/2 -translate-y-1/2 h-1 bg-slate-100 z-0" />
            <div
              className="absolute left-8 top-1/2 -translate-y-1/2 h-1 bg-[#16A34A] transition-all duration-500 z-0"
              style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 92}%` }}
            />

            {steps.map((s) => {
              const isDone = s.step < currentStep;
              const isCurrent = s.step === currentStep;

              return (
                <div key={s.step} className="relative z-10 flex flex-col items-center group">
                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-extrabold text-xs transition-all ${
                      isDone
                        ? 'bg-[#16A34A] text-white shadow-xs'
                        : isCurrent
                        ? 'bg-[#16A34A] text-white ring-4 ring-emerald-100 shadow-md scale-110'
                        : 'bg-white text-slate-400 border-2 border-slate-200'
                    }`}
                  >
                    {isDone ? <CheckCircle2 className="w-4 h-4" /> : s.step}
                  </div>
                  <span
                    className={`text-[10px] sm:text-xs font-bold mt-1.5 whitespace-nowrap ${
                      isCurrent ? 'text-[#16A34A]' : isDone ? 'text-slate-800' : 'text-slate-400'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Pickup Verification Mandatory Warning Banner */}
      {!activeTask.isVerified && (
        <div className="bg-amber-50/90 border border-amber-300 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-soft-card animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-amber-btn">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-extrabold text-[#0F172A]">
                Pickup Photo Verification Required Before Navigation
              </h3>
              <p className="text-[11px] sm:text-xs text-[#334155] mt-0.5 font-medium">
                You must take/upload a photo verification of the packaged surplus food before departing the donor location to navigate to the NGO.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/volunteer/verification')}
            className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold shadow-amber-btn transition-all shrink-0 cursor-pointer text-center whitespace-nowrap"
          >
            Verify Pickup Photo ➔
          </button>
        </div>
      )}

      {/* 2. Compact Horizontal Route Summary Bar (Req 1) */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs font-semibold">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200/80 font-bold">
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            <Bike className="w-3.5 h-3.5" />
            <span>Volunteer (Current Location)</span>
          </div>

          <ArrowRight className="w-3.5 h-3.5 text-slate-300 hidden sm:block" />

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-bold">
            <Store className="w-3.5 h-3.5 text-[#16A34A]" />
            <span>Pickup: <span className="font-extrabold">{activeTask.donorName}</span></span>
          </div>

          <ArrowRight className="w-3.5 h-3.5 text-slate-300 hidden sm:block" />

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200/80 font-bold">
            <Building2 className="w-3.5 h-3.5 text-blue-600" />
            <span>Destination: <span className="font-extrabold">{activeTask.ngoName}</span></span>
          </div>
        </div>

        <a
          href="https://www.openstreetmap.org"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 ml-auto"
        >
          <ExternalLink className="w-3 h-3" />
          <span>OpenStreetMap</span>
        </a>
      </div>

      {/* 3. Main Modular Delivery Tracking Map Container */}
      <DeliveryTrackingMap
        donorLocation={{
          lat: validateCoordinates(activeTask.donorLat, activeTask.donorLng)
            ? Number(activeTask.donorLat)
            : (validateCoordinates(user?.latitude, user?.longitude) ? Number(user.latitude) : 12.9546),
          lng: validateCoordinates(activeTask.donorLat, activeTask.donorLng)
            ? Number(activeTask.donorLng)
            : (validateCoordinates(user?.latitude, user?.longitude) ? Number(user.longitude) : 74.8847),
          title: activeTask.donorName || 'Donor Pickup',
          address: activeTask.donorAddress || 'Donor Pickup Address',
          phone: activeTask.donorPhone || '',
          email: activeTask.donationId?.donorId?.email || '',
          contactPerson: activeTask.donationId?.donorId?.name || '',
        }}
        ngoLocation={{
          lat: validateCoordinates(activeTask.ngoLat, activeTask.ngoLng)
            ? Number(activeTask.ngoLat)
            : (validateCoordinates(user?.latitude, user?.longitude) ? Number(user.latitude) + 0.015 : 12.9250),
          lng: validateCoordinates(activeTask.ngoLat, activeTask.ngoLng)
            ? Number(activeTask.ngoLng)
            : (validateCoordinates(user?.latitude, user?.longitude) ? Number(user.longitude) + 0.015 : 74.9000),
          title: activeTask.ngoName || 'NGO Dropoff Hub',
          address: activeTask.ngoAddress || 'NGO Dropoff Address',
          phone: activeTask.ngoPhone || '',
        }}
        volunteerLocation={{
          lat: validateCoordinates(user?.currentLocation?.latitude, user?.currentLocation?.longitude)
            ? Number(user.currentLocation.latitude)
            : (validateCoordinates(user?.latitude, user?.longitude) ? Number(user.latitude) : 12.9546),
          lng: validateCoordinates(user?.currentLocation?.latitude, user?.currentLocation?.longitude)
            ? Number(user.currentLocation.longitude)
            : (validateCoordinates(user?.latitude, user?.longitude) ? Number(user.longitude) : 74.8847),
          title: `Courier (${user?.name || 'You'})`,
          phone: user?.phone || '',
        }}
        deliveryStatus={activeTask.status || 'assigned'}
        className="w-full h-[520px] rounded-[20px] border border-slate-200 overflow-hidden shadow-xl"
      />

      {/* 4. Bottom Action Panel / Delivery Details Sheet */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-soft-card flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
        {/* Left: Origin ➔ Dropoff stack + Pickup Photo Thumbnail */}
        <div className="flex items-center gap-3 min-w-0">
          {activeTask.pickupPhoto ? (
            <div className="relative group shrink-0" title="Verified Pickup Photo">
              <img
                src={activeTask.pickupPhoto}
                alt="Verified Pickup"
                className="w-10 h-10 rounded-xl object-cover border-2 border-emerald-500 shadow-md"
              />
              <span className="absolute -bottom-1 -right-1 bg-emerald-500 text-white rounded-full p-0.5">
                <CheckCircle2 className="w-3 h-3" />
              </span>
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-emerald-50 text-[#16A34A] flex items-center justify-center shrink-0 border border-emerald-100">
              <MapPin className="w-4 h-4" />
            </div>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-slate-400 font-medium">Pickup:</span>
              <span className="font-extrabold text-slate-900 truncate">{activeTask.donorName}</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] mt-0.5">
              <span className="text-slate-400 font-medium">Dropoff:</span>
              <span className="font-extrabold text-slate-900 truncate">{activeTask.ngoName}</span>
            </div>
          </div>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {activeTask.donorPhone && (
            <a
              href={`tel:${activeTask.donorPhone}`}
              className="flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold transition-all cursor-pointer"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Call Donor</span>
            </a>
          )}
          {!activeTask.isVerified ? (
            <button
              onClick={() => navigate('/volunteer/verification')}
              className="flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold shadow-amber-btn transition-all cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Verify Pickup Photo First</span>
            </button>
          ) : (
            <button
              onClick={() => {
                window.open('https://www.openstreetmap.org', '_blank');
              }}
              className="flex-1 md:flex-initial inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#16A34A] hover:bg-emerald-700 text-white font-extrabold shadow-md transition-all cursor-pointer"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>Start Navigation</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default NavigationPage;
