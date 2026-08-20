import React from 'react';

const Home: React.FC = () => (
  <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-8">
    <div className="max-w-xl text-center space-y-5">
      <div className="mx-auto w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-black text-xl">P</div>
      <h1 className="text-4xl font-bold">PayPilot</h1>
      <p className="text-slate-400">Autonomous B2B collections and payment recovery.</p>
      <a className="inline-flex px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white" href="/login">Sign in</a>
    </div>
  </main>
);

export default Home;
