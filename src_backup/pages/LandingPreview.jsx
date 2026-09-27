import React from 'react';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import About from '../components/About';
import Products from '../components/Products';
import Services from '../components/Services';
import Membership from '../components/Membership';
import Reviews from '../components/Reviews';
import Contact from '../components/Contact';
import Footer from '../components/Footer';

/**
 * TEMPORARY PREVIEW PAGE
 * Renders the historical landing page for visual inspection.
 * This page does NOT modify any production files.
 * Route: /preview/landing
 */
const LandingPreview = () => {
  return (
    <div className="min-h-screen">
      <Navbar />
      <Hero />
      <About />
      <Products />
      <Services />
      <Membership />
      <Reviews />
      <Contact />
      <Footer />
    </div>
  );
};

export default LandingPreview;
