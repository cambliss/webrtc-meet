"use client";

import { useState, useMemo } from "react";
import { getSalesContent, getTranslation, salesFeaturesDatabase } from "@/src/lib/salesFeatures";
import type { SalesContent } from "@/src/lib/salesFeatures";

const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "hi", name: "हिंदी", flag: "🇮🇳" },
  { code: "or", name: "ଓଡ଼ିଆ", flag: "🇮🇳" },
];

export function SalesFeaturesClient() {
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [selectedCategory, setSelectedCategory] = useState("collaboration");

  const salesContent: SalesContent = useMemo(
    () => getSalesContent(selectedLanguage),
    [selectedLanguage],
  );

  const currentCategory = useMemo(
    () =>
      salesContent.categories.find((cat) =>
        cat.categoryKey.includes(selectedCategory),
      ),
    [salesContent.categories, selectedCategory],
  );

  const t = (key: string) => getTranslation(selectedLanguage, key);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-sm shadow-sm border-b border-blue-100">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-blue-600">
                {t("platform.name")} Sales Platform
              </h1>
              <p className="text-sm text-gray-600 mt-1">{t("platform.tagline")}</p>
            </div>

            {/* Language Selector */}
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <span className="text-sm font-semibold text-gray-700">
                {t("Language")}:
              </span>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => setSelectedLanguage(lang.code)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    selectedLanguage === lang.code
                      ? "bg-blue-600 text-white shadow-md"
                      : "bg-white text-gray-700 border border-gray-200 hover:border-blue-300"
                  }`}
                  title={lang.name}
                >
                  <span className="mr-1">{lang.flag}</span>
                  {lang.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Category Navigation */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
          {salesContent.categories.map((category) => {
            const categoryId = category.categoryKey.replace("category.", "").replace(".desc", "");
            const isSelected = selectedCategory === categoryId;
            return (
              <button
                key={category.categoryKey}
                onClick={() => setSelectedCategory(categoryId)}
                className={`p-3 rounded-xl text-center transition-all ${
                  isSelected
                    ? "bg-blue-600 text-white shadow-lg scale-105"
                    : "bg-white text-gray-700 border border-gray-200 hover:border-blue-300 hover:shadow-md"
                }`}
              >
                <div className="font-semibold text-sm">
                  {t(category.categoryKey)}
                </div>
                <div className="text-xs mt-1 opacity-75">
                  {category.features.length} features
                </div>
              </button>
            );
          })}
        </div>

        {/* Features Grid */}
        {currentCategory && (
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              {t(currentCategory.categoryKey)}
            </h2>
            <p className="text-gray-600 mb-8">{t(currentCategory.descriptionKey)}</p>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {currentCategory.features.map((feature) => (
                <FeatureCard
                  key={feature.id}
                  feature={feature}
                  translations={salesContent.translations}
                  getTranslation={t}
                />
              ))}
            </div>
          </div>
        )}

        {/* Sales CTA Section */}
        <section className="mt-16 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 p-8 text-white text-center">
          <h3 className="text-2xl font-bold mb-4">Ready to transform your meetings?</h3>
          <p className="mb-6 text-blue-100 max-w-2xl mx-auto">
            {t("platform.tagline")}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button className="px-6 py-3 bg-white text-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition-all shadow-lg">
              {t("cta.schedule_demo")}
            </button>
            <button className="px-6 py-3 border border-white text-white font-semibold rounded-lg hover:bg-white/10 transition-all">
              {t("cta.contact_sales")}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

interface FeatureCardProps {
  feature: ReturnType<typeof salesFeaturesDatabase[number]["features"][number]>;
  translations: Record<string, string>;
  getTranslation: (key: string) => string;
}

function FeatureCard({ feature, getTranslation: t }: FeatureCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6 hover:shadow-lg transition-all">
      {/* Icon & Title */}
      <div className="flex items-start gap-3 mb-3">
        <span className="text-3xl">{feature.icon}</span>
        <h4 className="text-lg font-bold text-gray-900 flex-1">
          {t(feature.titleKey)}
        </h4>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-700 mb-4">
        {t(feature.descriptionKey)}
      </p>

      {/* Benefits (Collapsible) */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="text-sm font-semibold text-blue-600 hover:text-blue-700 mb-3 inline-flex items-center gap-1"
      >
        <span>{isExpanded ? "▼" : "▶"} Key Benefits</span>
      </button>

      {isExpanded && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
          <ul className="space-y-2">
            {feature.benefitsKey.map((benefitKey, idx) => (
              <li key={idx} className="text-sm text-gray-700 flex items-start gap-2">
                <span className="text-blue-600 font-bold">✓</span>
                <span>{t(benefitKey)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Use Cases */}
      <div className="text-xs text-gray-600">
        <strong>Use cases:</strong>
        <ul className="mt-2 space-y-1">
          {feature.useCasesKey.map((useKey, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="text-gray-400">•</span>
              <span>{t(useKey)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
