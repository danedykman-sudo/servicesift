import { Wrench } from 'lucide-react';

export default function Maintenance() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-slate-700">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center">
              <Wrench className="w-8 h-8 text-blue-400" />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-white mb-4">
            Under Maintenance
          </h1>

          <p className="text-slate-300 text-lg mb-6">
            We're currently making some improvements to serve you better.
          </p>

          <p className="text-slate-400">
            Please check back soon. We'll be back online shortly.
          </p>
        </div>
      </div>
    </div>
  );
}
