
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Calendar, Clock, Users, MessageSquare, BarChart3, Bot, Link2, Video, Brain, Zap, CheckCircle2, XCircle, Sparkles, Target, TrendingUp, Smartphone } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/hooks';
import { LanguageSwitcher } from '@/components/language-switcher';

export function LandingPageContent() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-white to-blue-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <Link href="/" className="flex items-center">
              <div className="relative w-[200px] h-[60px]">
                <Image
                  src="/anytimebot-logo.png"
                  alt="ANYTIMEBOT"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
            </Link>
            <div className="flex items-center space-x-4">
              <Link href="/pricing" className="text-gray-700 hover:text-[#00D4FF] font-medium transition-colors">
                Pricing
              </Link>
              <LanguageSwitcher />
              <Button asChild variant="ghost" className="hover:bg-cyan-50">
                <Link href="/auth/signin">{t('landing.signIn')}</Link>
              </Button>
              <Button asChild className="bg-[#00D4FF] hover:bg-[#00B8E6] text-[#001F3F]">
                <Link href="/auth/signup">{t('landing.getStarted')}</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-20 pb-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-100/20 via-transparent to-blue-100/20"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <Badge className="bg-gradient-to-r from-[#00D4FF] to-[#00B8E6] text-[#001F3F] text-sm px-4 py-1">
                <Sparkles className="w-4 h-4 mr-2" />
                {t('landing.heroHighlight')}
              </Badge>
            </div>
            <h1 className="text-5xl md:text-7xl font-bold text-[#001F3F] mb-6 leading-tight">
              {t('landing.title')}
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00D4FF] to-[#0066CC]">
                {t('landing.subtitle')}
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-700 mb-10 max-w-4xl mx-auto leading-relaxed">
              {t('landing.description')}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              <Button size="lg" asChild className="bg-gradient-to-r from-[#00D4FF] to-[#00B8E6] hover:from-[#00B8E6] hover:to-[#0099CC] text-[#001F3F] text-lg px-8 py-6 shadow-lg hover:shadow-xl transition-all">
                <Link href="/auth/signup">
                  {t('landing.getStarted')}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="border-2 border-[#00D4FF] text-[#001F3F] hover:bg-cyan-50 text-lg px-8 py-6">
                <Link href="/auth/signin">{t('landing.signIn')}</Link>
              </Button>
            </div>
            
            {/* Hero Image/Icon */}
            <div className="flex justify-center mb-8">
              <div className="relative w-32 h-32 animate-pulse">
                <Image
                  src="/Anytimebot-icon.png"
                  alt="ANYTIMEBOT Icon"
                  fill
                  className="object-contain drop-shadow-2xl"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Different Section */}
      <section className="py-20 bg-gradient-to-br from-[#001F3F] to-[#003366]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
              {t('landing.whyDifferent')}
            </h2>
            <p className="text-xl text-cyan-100 max-w-3xl mx-auto">
              {t('landing.whyDifferentSubtitle')}
            </p>
          </div>
        </div>
      </section>

      {/* Features Section - Exclusive Features First */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-[#001F3F] mb-4">
              {t('landing.features.title')}
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              {t('landing.features.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
            {/* WhatsApp Bot - EXCLUSIVE */}
            <div className="relative group p-8 rounded-2xl bg-gradient-to-br from-cyan-50 to-cyan-100 hover:shadow-2xl transition-all duration-300 border-2 border-[#00D4FF]">
              <Badge className="absolute top-4 right-4 bg-gradient-to-r from-orange-500 to-red-500 text-white">
                {t('landing.features.whatsappBot.badge')}
              </Badge>
              <div className="w-16 h-16 bg-gradient-to-br from-[#00D4FF] to-[#00B8E6] rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <MessageSquare className="h-8 w-8 text-[#001F3F]" />
              </div>
              <h3 className="text-2xl font-bold text-[#001F3F] mb-3">
                {t('landing.features.whatsappBot.title')}
              </h3>
              <p className="text-gray-700 leading-relaxed">
                {t('landing.features.whatsappBot.description')}
              </p>
            </div>

            {/* Smart Video Rooms - EXCLUSIVE */}
            <div className="relative group p-8 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 hover:shadow-2xl transition-all duration-300 border-2 border-[#00D4FF]">
              <Badge className="absolute top-4 right-4 bg-gradient-to-r from-orange-500 to-red-500 text-white">
                {t('landing.features.smartVideoRooms.badge')}
              </Badge>
              <div className="w-16 h-16 bg-gradient-to-br from-[#001F3F] to-[#003366] rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Video className="h-8 w-8 text-[#00D4FF]" />
              </div>
              <h3 className="text-2xl font-bold text-[#001F3F] mb-3">
                {t('landing.features.smartVideoRooms.title')}
              </h3>
              <p className="text-gray-700 leading-relaxed">
                {t('landing.features.smartVideoRooms.description')}
              </p>
            </div>

            {/* Pre-Meeting Briefs - EXCLUSIVE */}
            <div className="relative group p-8 rounded-2xl bg-gradient-to-br from-cyan-50 to-cyan-100 hover:shadow-2xl transition-all duration-300 border-2 border-[#00D4FF]">
              <Badge className="absolute top-4 right-4 bg-gradient-to-r from-orange-500 to-red-500 text-white">
                {t('landing.features.preMeetingBriefs.badge')}
              </Badge>
              <div className="w-16 h-16 bg-gradient-to-br from-[#00D4FF] to-[#00B8E6] rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Brain className="h-8 w-8 text-[#001F3F]" />
              </div>
              <h3 className="text-2xl font-bold text-[#001F3F] mb-3">
                {t('landing.features.preMeetingBriefs.title')}
              </h3>
              <p className="text-gray-700 leading-relaxed">
                {t('landing.features.preMeetingBriefs.description')}
              </p>
            </div>

            {/* Intelligent Routing - EXCLUSIVE */}
            <div className="relative group p-8 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 hover:shadow-2xl transition-all duration-300 border-2 border-[#00D4FF]">
              <Badge className="absolute top-4 right-4 bg-gradient-to-r from-orange-500 to-red-500 text-white">
                {t('landing.features.intelligentRouting.badge')}
              </Badge>
              <div className="w-16 h-16 bg-gradient-to-br from-[#001F3F] to-[#003366] rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Target className="h-8 w-8 text-[#00D4FF]" />
              </div>
              <h3 className="text-2xl font-bold text-[#001F3F] mb-3">
                {t('landing.features.intelligentRouting.title')}
              </h3>
              <p className="text-gray-700 leading-relaxed">
                {t('landing.features.intelligentRouting.description')}
              </p>
            </div>

            {/* Team Scheduling - ENHANCED */}
            <div className="relative group p-8 rounded-2xl bg-gradient-to-br from-cyan-50 to-cyan-100 hover:shadow-2xl transition-all duration-300">
              <Badge className="absolute top-4 right-4 bg-gradient-to-r from-blue-500 to-indigo-500 text-white">
                {t('landing.features.teamScheduling.badge')}
              </Badge>
              <div className="w-16 h-16 bg-gradient-to-br from-[#00D4FF] to-[#00B8E6] rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Users className="h-8 w-8 text-[#001F3F]" />
              </div>
              <h3 className="text-2xl font-bold text-[#001F3F] mb-3">
                {t('landing.features.teamScheduling.title')}
              </h3>
              <p className="text-gray-700 leading-relaxed">
                {t('landing.features.teamScheduling.description')}
              </p>
            </div>

            {/* Post-Meeting Automation - EXCLUSIVE */}
            <div className="relative group p-8 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 hover:shadow-2xl transition-all duration-300 border-2 border-[#00D4FF]">
              <Badge className="absolute top-4 right-4 bg-gradient-to-r from-orange-500 to-red-500 text-white">
                {t('landing.features.postMeetingAuto.badge')}
              </Badge>
              <div className="w-16 h-16 bg-gradient-to-br from-[#001F3F] to-[#003366] rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Zap className="h-8 w-8 text-[#00D4FF]" />
              </div>
              <h3 className="text-2xl font-bold text-[#001F3F] mb-3">
                {t('landing.features.postMeetingAuto.title')}
              </h3>
              <p className="text-gray-700 leading-relaxed">
                {t('landing.features.postMeetingAuto.description')}
              </p>
            </div>
          </div>

          {/* Additional Features Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="p-6 rounded-xl bg-gray-50 hover:shadow-lg transition-all">
              <div className="w-12 h-12 bg-[#00D4FF] rounded-lg flex items-center justify-center mb-4">
                <Calendar className="h-6 w-6 text-[#001F3F]" />
              </div>
              <h3 className="text-lg font-semibold text-[#001F3F] mb-2">
                {t('landing.features.eventTypes.title')}
              </h3>
              <p className="text-gray-600 text-sm">
                {t('landing.features.eventTypes.description')}
              </p>
            </div>

            <div className="p-6 rounded-xl bg-gray-50 hover:shadow-lg transition-all">
              <div className="w-12 h-12 bg-[#001F3F] rounded-lg flex items-center justify-center mb-4">
                <Clock className="h-6 w-6 text-[#00D4FF]" />
              </div>
              <h3 className="text-lg font-semibold text-[#001F3F] mb-2">
                {t('landing.features.availability.title')}
              </h3>
              <p className="text-gray-600 text-sm">
                {t('landing.features.availability.description')}
              </p>
            </div>

            <div className="p-6 rounded-xl bg-gray-50 hover:shadow-lg transition-all">
              <div className="w-12 h-12 bg-[#00D4FF] rounded-lg flex items-center justify-center mb-4">
                <TrendingUp className="h-6 w-6 text-[#001F3F]" />
              </div>
              <h3 className="text-lg font-semibold text-[#001F3F] mb-2">
                {t('landing.features.analytics.title')}
              </h3>
              <p className="text-gray-600 text-sm">
                {t('landing.features.analytics.description')}
              </p>
            </div>

            <div className="p-6 rounded-xl bg-gray-50 hover:shadow-lg transition-all">
              <div className="w-12 h-12 bg-[#001F3F] rounded-lg flex items-center justify-center mb-4">
                <Link2 className="h-6 w-6 text-[#00D4FF]" />
              </div>
              <h3 className="text-lg font-semibold text-[#001F3F] mb-2">
                {t('landing.features.bookingPages.title')}
              </h3>
              <p className="text-gray-600 text-sm">
                {t('landing.features.bookingPages.description')}
              </p>
            </div>

            <div className="p-6 rounded-xl bg-gray-50 hover:shadow-lg transition-all">
              <div className="w-12 h-12 bg-[#00D4FF] rounded-lg flex items-center justify-center mb-4">
                <BarChart3 className="h-6 w-6 text-[#001F3F]" />
              </div>
              <h3 className="text-lg font-semibold text-[#001F3F] mb-2">
                {t('landing.features.calendar.title')}
              </h3>
              <p className="text-gray-600 text-sm">
                {t('landing.features.calendar.description')}
              </p>
            </div>

            <div className="p-6 rounded-xl bg-gray-50 hover:shadow-lg transition-all">
              <div className="w-12 h-12 bg-[#001F3F] rounded-lg flex items-center justify-center mb-4">
                <Smartphone className="h-6 w-6 text-[#00D4FF]" />
              </div>
              <h3 className="text-lg font-semibold text-[#001F3F] mb-2">
                {t('landing.features.mobileFirst.title')}
              </h3>
              <p className="text-gray-600 text-sm">
                {t('landing.features.mobileFirst.description')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-20 bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-[#001F3F] mb-4">
              {t('landing.comparison.title')}
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              {t('landing.comparison.subtitle')}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-[#001F3F] to-[#003366]">
                  <tr>
                    <th className="px-6 py-4 text-left text-white font-semibold">Función</th>
                    <th className="px-6 py-4 text-center text-[#00D4FF] font-bold text-lg">
                      {t('landing.comparison.anytimebot')}
                    </th>
                    <th className="px-6 py-4 text-center text-gray-300 font-semibold">
                      {t('landing.comparison.others')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <tr className="hover:bg-cyan-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {t('landing.comparison.whatsappNative')}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <XCircle className="w-8 h-8 text-red-500 mx-auto" />
                    </td>
                  </tr>
                  <tr className="hover:bg-cyan-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {t('landing.comparison.smartVideo')}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <XCircle className="w-8 h-8 text-red-500 mx-auto" />
                    </td>
                  </tr>
                  <tr className="hover:bg-cyan-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {t('landing.comparison.preMeetingAI')}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <XCircle className="w-8 h-8 text-red-500 mx-auto" />
                    </td>
                  </tr>
                  <tr className="hover:bg-cyan-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {t('landing.comparison.postMeetingAuto')}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <XCircle className="w-8 h-8 text-red-500 mx-auto" />
                    </td>
                  </tr>
                  <tr className="hover:bg-cyan-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {t('landing.comparison.intelligentRouting')}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <XCircle className="w-8 h-8 text-red-500 mx-auto" />
                    </td>
                  </tr>
                  <tr className="hover:bg-cyan-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {t('landing.comparison.teamAdvanced')}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="text-yellow-500 font-semibold">Básico</div>
                    </td>
                  </tr>
                  <tr className="hover:bg-cyan-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {t('landing.comparison.unlimitedEvents')}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="text-yellow-500 font-semibold">Limitado</div>
                    </td>
                  </tr>
                  <tr className="hover:bg-cyan-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {t('landing.comparison.aiAnalytics')}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="text-yellow-500 font-semibold">Básico</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-12 text-center">
            <p className="text-lg text-gray-600 mb-6">
              Y estas son solo las funciones principales. ANYTIMEBOT tiene mucho más...
            </p>
            <Button size="lg" asChild className="bg-gradient-to-r from-[#00D4FF] to-[#00B8E6] hover:from-[#00B8E6] hover:to-[#0099CC] text-[#001F3F] text-lg px-8 py-6 shadow-lg hover:shadow-xl transition-all">
              <Link href="/auth/signup">
                {t('landing.cta.button')}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 bg-gradient-to-r from-[#001F3F] via-[#003366] to-[#001F3F] relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8 relative">
          <div className="mb-8">
            <Sparkles className="w-16 h-16 text-[#00D4FF] mx-auto mb-4 animate-pulse" />
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            {t('landing.cta.title')}
          </h2>
          <p className="text-xl md:text-2xl text-cyan-100 mb-10 leading-relaxed">
            {t('landing.cta.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" asChild className="bg-[#00D4FF] hover:bg-[#00B8E6] text-[#001F3F] text-lg px-10 py-7 shadow-2xl hover:shadow-3xl transition-all">
              <Link href="/auth/signup">
                {t('landing.cta.button')}
                <ArrowRight className="ml-2 h-6 w-6" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="border-2 border-[#00D4FF] text-white hover:bg-[#00D4FF] hover:text-[#001F3F] text-lg px-10 py-7">
              <Link href="/auth/signin">
                {t('landing.signIn')}
              </Link>
            </Button>
          </div>
          <p className="text-cyan-200 mt-8 text-sm">
            ✓ Sin tarjeta de crédito  •  ✓ Configuración en 2 minutos  •  ✓ Soporte 24/7
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col items-center space-y-4">
            <Link href="/" className="flex items-center">
              <div className="relative w-[200px] h-[60px]">
                <Image
                  src="/anytimebot-logo.png"
                  alt="ANYTIMEBOT"
                  fill
                  className="object-contain"
                />
              </div>
            </Link>
            <div className="flex items-center space-x-6 text-sm text-gray-600">
              <Link href="/privacy" className="hover:text-[#00D4FF] transition-colors">
                {t('landing.privacyPolicy')}
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/terms" className="hover:text-[#00D4FF] transition-colors">
                {t('landing.termsOfService')}
              </Link>
            </div>
            <p className="text-gray-500 text-sm">
              © 2025 ANYTIMEBOT. {t('landing.allRightsReserved')}.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
