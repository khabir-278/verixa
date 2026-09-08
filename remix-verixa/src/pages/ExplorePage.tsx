import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Search, Sparkles, Filter, ShieldCheck, Heart, MessageCircle, Eye, Scan, X } from 'lucide-react';
import { Post } from '../types';

export const ExplorePage: React.FC = () => {
  const {
    posts,
    selectedExploreCategory,
    setSelectedExploreCategory,
    exploreSearchQuery,
    setExploreSearchQuery,
  } = useApp();

  const [activeModalPost, setActiveModalPost] = useState<Post | null>(null);

  const categories = [
    'All',
    'Technology',
    'Sports',
    'Gaming',
    'Travel',
    'Education',
    'Music',
    'Photography',
  ];

  // Filter posts
  const filteredPosts = posts.filter((post) => {
    const matchesCategory =
      selectedExploreCategory === 'All' ||
      post.tags?.some((t) => t.toLowerCase().includes(selectedExploreCategory.toLowerCase())) ||
      post.caption.toLowerCase().includes(selectedExploreCategory.toLowerCase());

    const matchesSearch =
      !exploreSearchQuery ||
      post.caption.toLowerCase().includes(exploreSearchQuery.toLowerCase()) ||
      post.user.name.toLowerCase().includes(exploreSearchQuery.toLowerCase()) ||
      post.user.username.toLowerCase().includes(exploreSearchQuery.toLowerCase());

    return matchesCategory && matchesSearch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Search & Header */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2">
              Explore Safe Media <Sparkles className="w-6 h-6 text-purple-400 animate-pulse" />
            </h1>
            <p className="text-xs text-slate-400">
              Discover verified human media curated by VERIXA AI content classifiers.
            </p>
          </div>

          {/* Search bar */}
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={exploreSearchQuery}
              onChange={(e) => setExploreSearchQuery(e.target.value)}
              placeholder="Search posts, creators, AI tags..."
              className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-purple-500/20 rounded-full text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        {/* Categories Bar */}
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-2 pt-1">
          {categories.map((cat) => {
            const active = selectedExploreCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedExploreCategory(cat)}
                className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                  active
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-purple-900/30'
                    : 'bg-slate-900/80 border border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      {filteredPosts.length === 0 ? (
        <div className="p-16 text-center rounded-3xl bg-slate-900/40 border border-slate-800 space-y-3">
          <div className="w-12 h-12 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mx-auto">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">No Verified Media Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {exploreSearchQuery
              ? `No posts matched your search for "${exploreSearchQuery}". Try another keyword or clear the search.`
              : `No posts currently available in category "${selectedExploreCategory}".`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredPosts.map((post) => (
            <div
              key={post.id}
              onClick={() => setActiveModalPost(post)}
              className="group relative rounded-2xl bg-slate-900 border border-purple-500/20 overflow-hidden cursor-pointer hover:border-purple-500/50 transition shadow-lg"
            >
              {post.mediaUrl ? (
                <div className="h-64 overflow-hidden relative">
                  <img
                    src={post.mediaUrl}
                    alt={post.caption}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent opacity-0 group-hover:opacity-100 transition p-4 flex flex-col justify-end">
                    <p className="text-xs text-white font-semibold line-clamp-2">{post.caption}</p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-purple-300">
                      <span className="flex items-center gap-1">
                        <Heart className="w-3.5 h-3.5 fill-purple-400 text-purple-400" /> {post.likes}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="w-3.5 h-3.5 text-purple-400" /> {post.comments.length}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-5 h-64 flex flex-col justify-between bg-gradient-to-br from-slate-900 via-indigo-950/30 to-purple-950/30">
                  <p className="text-xs text-slate-200 line-clamp-5 leading-relaxed">{post.caption}</p>
                  <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-[11px] text-slate-400">
                    <span>@{post.user.username}</span>
                    <span className="text-emerald-400 flex items-center gap-1 font-mono">
                      <ShieldCheck className="w-3 h-3" /> Safe
                    </span>
                  </div>
                </div>
              )}

              {/* AI Trust Overlay Badge */}
              <div className="absolute top-2 left-2 px-2.5 py-0.5 rounded-full bg-slate-950/80 backdrop-blur-md border border-purple-500/30 text-[10px] text-purple-300 font-mono">
                ✓ AI Safe
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {activeModalPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="relative max-w-2xl w-full bg-slate-900 border border-purple-500/30 rounded-3xl p-6 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <img
                  src={activeModalPost.user.avatar}
                  alt={activeModalPost.user.name}
                  className="w-9 h-9 rounded-full object-cover border border-purple-500/30"
                />
                <div>
                  <h4 className="font-bold text-sm text-white">{activeModalPost.user.name}</h4>
                  <p className="text-xs text-emerald-400 font-mono">{activeModalPost.user.aiTrustBadge}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveModalPost(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {activeModalPost.mediaUrl && (
                <div className="rounded-2xl overflow-hidden bg-black max-h-80 flex items-center justify-center">
                  <img src={activeModalPost.mediaUrl} alt="Post detail" className="max-h-80 object-contain" />
                </div>
              )}

              <p className="text-sm text-slate-200">{activeModalPost.caption}</p>

              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-purple-300 space-y-1">
                <span className="font-bold block">VERIXA Vision AI Certificate:</span>
                <p className="text-slate-400">{activeModalPost.aiScanDetails.summary}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
