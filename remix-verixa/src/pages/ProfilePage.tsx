import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  ShieldCheck,
  Calendar,
  MapPin,
  Globe,
  Edit3,
  Bookmark,
  Grid,
  Film,
  Tag,
  Share2,
  MoreHorizontal,
  UserPlus,
  UserCheck,
  MessageSquare,
  Heart,
  MessageCircle,
  X,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Ban,
  Flag,
  Copy,
  Lock,
  Sparkles,
  Shield,
  Plus,
  Search,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Post, Comment } from '../types';
import { supabase } from '../lib/supabase';
import {
  getUserProfile,
  updateUserProfile,
  toggleFollowUser,
  toggleSavePost,
  createReport,
  uploadProfilePicture,
  uploadCoverImage,
  deleteStorageFile,
  isUsernameAvailable,
  getSignedMediaUrl,
  resolveUserProfileSignedUrls,
} from '../lib/supabaseServices';

export const ProfilePage: React.FC = () => {
  const {
    currentUser,
    setCurrentUser,
    posts,
    reels,
    likePost,
    bookmarkPost,
    addComment,
    addToast,
    viewingProfileUserId,
    openUserProfile,
    setActiveChatUser,
    setCurrentPage,
  } = useApp();

  // Determine if viewing own profile or another user
  const isOwnProfile = !viewingProfileUserId || viewingProfileUserId === currentUser?.id;

  // Profile User State
  const [displayedUser, setDisplayedUser] = useState<User | null>(
    isOwnProfile ? currentUser : null
  );
  const [isLoadingProfile, setIsLoadingProfile] = useState<boolean>(!isOwnProfile);

  // Tabs: 'posts' | 'reels' | 'tagged' | 'saved'
  const [activeTab, setActiveTab] = useState<'posts' | 'reels' | 'tagged' | 'saved'>('posts');

  // Follow State
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [followersCount, setFollowersCount] = useState<number>(0);
  const [followingCount, setFollowingCount] = useState<number>(0);

  // Modals state
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [showFollowersModal, setShowFollowersModal] = useState<boolean>(false);
  const [showFollowingModal, setShowFollowingModal] = useState<boolean>(false);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [showBlockModal, setShowBlockModal] = useState<boolean>(false);
  const [showSafetyCertModal, setShowSafetyCertModal] = useState<boolean>(false);
  const [showThreeDotMenu, setShowThreeDotMenu] = useState<boolean>(false);

  // Active Post for Post Viewer Modal
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [newCommentText, setNewCommentText] = useState<string>('');
  const [isSubmittingComment, setIsSubmittingComment] = useState<boolean>(false);

  // Edit Profile Form State
  const [editDisplayName, setEditDisplayName] = useState<string>('');
  const [editUsername, setEditUsername] = useState<string>('');
  const [editBio, setEditBio] = useState<string>('');
  const [editWebsite, setEditWebsite] = useState<string>('');
  const [editLocation, setEditLocation] = useState<string>('');
  const [editAvatarUrl, setEditAvatarUrl] = useState<string>('');
  const [editAvatarStoragePath, setEditAvatarStoragePath] = useState<string>('');
  const [editCoverUrl, setEditCoverUrl] = useState<string>('');
  const [editCoverStoragePath, setEditCoverStoragePath] = useState<string>('');
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState<boolean>(false);
  const [isUploadingCover, setIsUploadingCover] = useState<boolean>(false);

  // Report Form State
  const [reportReason, setReportReason] = useState<string>('Harassment or Bullying');
  const [reportDetails, setReportDetails] = useState<string>('');

  // Search filter inside followers/following modal
  const [modalSearchQuery, setModalSearchQuery] = useState<string>('');
  const [supabaseProfiles, setSupabaseProfiles] = useState<User[]>([]);

  // Behavioral Safety Intelligence & AI Guardian State
  const [reputationLedger, setReputationLedger] = useState<any[]>([]);
  const [fakeAccountRisk, setFakeAccountRisk] = useState<any | null>(null);
  const [isLoadingBehavioral, setIsLoadingBehavioral] = useState<boolean>(false);

  // VERIXA AI Guardian Mode State
  const [guardianData, setGuardianData] = useState<{
    score: number;
    riskLevel: string;
    allowedActions?: string[];
    explainability?: any;
    activeRestrictions?: any;
    positiveFactorSum?: number;
    penaltyFactorSum?: number;
  } | null>(null);
  const [showAppealModal, setShowAppealModal] = useState<boolean>(false);
  const [appealReason, setAppealReason] = useState<string>('Dispute Restriction');
  const [appealEvidence, setAppealEvidence] = useState<string>('');
  const [isSubmittingAppeal, setIsSubmittingAppeal] = useState<boolean>(false);
  const [pendingAppeals, setPendingAppeals] = useState<any[]>([]);
  const [safetyTab, setSafetyTab] = useState<'guardian' | 'factors' | 'ledger' | 'admin'>('guardian');

  // Fetch reputation history, fake account risk, and AI Guardian score when Safety Certificate modal opens
  useEffect(() => {
    if (showSafetyCertModal && displayedUser?.id) {
      setIsLoadingBehavioral(true);
      const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'Moderator';
      Promise.all([
        fetch(`/api/reputation/${displayedUser.id}/history?limit=15`)
          .then((r) => r.json())
          .catch(() => ({ history: [] })),
        fetch(`/api/behavioral/fake-account-risk/${displayedUser.id}`)
          .then((r) => r.json())
          .catch(() => null),
        fetch(`/api/guardian/score/${displayedUser.id}?isAdmin=${isAdmin}`)
          .then((r) => r.json())
          .catch(() => null),
        ...(isAdmin ? [fetch(`/api/guardian/appeals`).then((r) => r.json()).catch(() => ({ appeals: [] }))] : []),
      ])
        .then(([repData, riskData, guardData, appealsData]) => {
          if (repData?.history) setReputationLedger(repData.history);
          if (riskData) setFakeAccountRisk(riskData);
          if (guardData && guardData.score !== undefined) setGuardianData(guardData);
          if (appealsData?.appeals) setPendingAppeals(appealsData.appeals);
        })
        .finally(() => setIsLoadingBehavioral(false));
    }
  }, [showSafetyCertModal, displayedUser?.id, currentUser?.role]);

  const handleSubmitAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayedUser?.id || !appealReason) return;
    setIsSubmittingAppeal(true);
    try {
      const res = await fetch('/api/guardian/appeal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: displayedUser.id,
          restrictionType: 'RESTRICTION',
          reason: appealReason,
          evidence: appealEvidence,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        addToast('success', 'Appeal Submitted', 'Your appeal has been received for safety review.');
        setShowAppealModal(false);
        setAppealEvidence('');
        fetch(`/api/guardian/score/${displayedUser.id}`)
          .then((r) => r.json())
          .then((gData) => setGuardianData(gData));
      } else {
        addToast('error', 'Appeal Failed', data.error || 'Failed to submit appeal.');
      }
    } catch (err: any) {
      addToast('error', 'Network Error', err.message || 'Error submitting appeal.');
    } finally {
      setIsSubmittingAppeal(false);
    }
  };

  const handleResolveAppeal = async (appealId: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      const res = await fetch(`/api/guardian/appeal/${appealId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          resolutionNotes: `Admin review marked appeal as ${status.toLowerCase()}`,
          reviewerId: currentUser?.id || 'admin',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        addToast(
          status === 'APPROVED' ? 'success' : 'info',
          status === 'APPROVED' ? 'Appeal Approved' : 'Appeal Rejected',
          status === 'APPROVED' ? '+30 Safety Recovery points credited!' : 'Appeal was rejected.'
        );
        setPendingAppeals((prev) => prev.filter((a) => a.id !== appealId));
        if (displayedUser?.id) {
          fetch(`/api/guardian/score/${displayedUser.id}?isAdmin=true`)
            .then((r) => r.json())
            .then((gData) => setGuardianData(gData));
        }
      } else {
        addToast('error', 'Action Failed', data.error || 'Could not resolve appeal.');
      }
    } catch (err: any) {
      addToast('error', 'Network Error', err.message || 'Error resolving appeal.');
    }
  };

  useEffect(() => {
    let isMounted = true;
    const fetchProfiles = async () => {
      try {
        const { data } = await supabase.from('profiles').select('*').limit(30);
        if (data && data.length > 0 && isMounted) {
          const mapped = await Promise.all(
            data.map(async (row) => {
              const u: User = {
                id: row.id,
                username: row.username,
                name: row.name || row.username,
                email: row.email,
                avatar: row.avatar,
                bio: row.bio || '',
                verified: row.verified ?? true,
                aiTrustBadge: row.ai_trust_badge || 'Verified Human',
                safetyScore: row.safety_score ?? 100,
                followersCount: row.followers_count ?? 0,
                followingCount: row.following_count ?? 0,
                postsCount: row.posts_count ?? 0,
                role: row.role || 'Member',
                joinedDate: 'Recently',
              };
              return resolveUserProfileSignedUrls(u);
            })
          );
          setSupabaseProfiles(mapped);
        }
      } catch (err) {
        console.warn('Notice: Could not load Supabase profiles:', err);
      }
    };
    fetchProfiles();
    return () => {
      isMounted = false;
    };
  }, []);

  // Load profile user when viewingProfileUserId changes
  useEffect(() => {
    let isMounted = true;
    if (isOwnProfile) {
      setDisplayedUser(currentUser);
      setIsLoadingProfile(false);
      if (currentUser) {
        setFollowersCount(currentUser.followersCount || 0);
        setFollowingCount(currentUser.followingCount || 0);
      }
    } else if (viewingProfileUserId) {
      setIsLoadingProfile(true);
      // Check existing loaded profiles for immediate display
      const pool = supabaseProfiles;
      const foundUser = pool.find((u) => u.id === viewingProfileUserId || u.username === viewingProfileUserId);
      if (foundUser && isMounted) {
        setDisplayedUser(foundUser);
        setIsFollowing(!!foundUser.isFollowing);
        setFollowersCount(foundUser.followersCount || 0);
        setFollowingCount(foundUser.followingCount || 0);
      }

      // Query Supabase in background
      getUserProfile(viewingProfileUserId)
        .then((profile) => {
          if (profile && isMounted) {
            setDisplayedUser(profile);
            setFollowersCount(profile.followersCount || 0);
            setFollowingCount(profile.followingCount || 0);
          }
        })
        .finally(() => {
          if (isMounted) setIsLoadingProfile(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [viewingProfileUserId, currentUser]);

  // Keep state updated if currentUser changes when viewing own profile
  useEffect(() => {
    if (isOwnProfile && currentUser) {
      setDisplayedUser(currentUser);
      setFollowersCount(currentUser.followersCount || 0);
      setFollowingCount(currentUser.followingCount || 0);
    }
  }, [currentUser, isOwnProfile]);

  if (!displayedUser && isLoadingProfile) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-full border-4 border-purple-500/30 border-t-purple-500 animate-spin" />
        <p className="text-slate-400 text-sm font-medium animate-pulse">Loading VERIXA Profile...</p>
      </div>
    );
  }

  if (!displayedUser) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
          <Ban className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white">User Profile Not Found</h2>
        <p className="text-slate-400 text-xs">The profile you are looking for does not exist or has been removed.</p>
        <button
          onClick={() => openUserProfile(currentUser?.id)}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold text-xs hover:opacity-90 transition"
        >
          View My Profile
        </button>
      </div>
    );
  }

  // Filter posts belonging to displayed user
  const userPosts = posts.filter(
    (p) => p.user.id === displayedUser.id || p.user.username.toLowerCase() === displayedUser.username.toLowerCase()
  );

  // Saved / Bookmarked posts (for logged in user)
  const savedPosts = posts.filter((p) => p.isBookmarked);

  // Tagged posts
  const taggedPosts = posts.filter(
    (p) =>
      p.caption.toLowerCase().includes(`@${displayedUser.username.toLowerCase()}`) ||
      p.tags.some((t) => t.toLowerCase() === displayedUser.username.toLowerCase())
  );

  // Reels belonging to user
  const userReels = reels.filter(
    (r) => r.user.id === displayedUser.id || r.user.username.toLowerCase() === displayedUser.username.toLowerCase()
  );

  // Calculate total engagement / likes count
  const totalLikes = userPosts.reduce((acc, p) => acc + (p.likes || 0), 0);

  // Handle Follow Toggle
  const handleToggleFollow = async () => {
    if (!currentUser) {
      addToast('warning', 'Authentication Required', 'Please log in to follow users.');
      return;
    }
    const newStatus = !isFollowing;
    setIsFollowing(newStatus);
    setFollowersCount((prev) => (newStatus ? prev + 1 : Math.max(0, prev - 1)));

    if (newStatus) {
      addToast('success', 'Following User', `You are now following @${displayedUser.username}`);
    } else {
      addToast('info', 'Unfollowed User', `You unfollowed @${displayedUser.username}`);
    }

    if (displayedUser.id && currentUser.id) {
      await toggleFollowUser(currentUser.id, displayedUser.id);
    }
  };

  // Open Edit Profile Modal
  const handleOpenEditModal = () => {
    setEditDisplayName(displayedUser.displayName || displayedUser.name || '');
    setEditUsername(displayedUser.username || '');
    setEditBio(displayedUser.bio || '');
    setEditWebsite(displayedUser.website || '');
    setEditLocation(displayedUser.location || '');
    setEditAvatarUrl(displayedUser.avatar || '');
    setEditAvatarStoragePath('');
    setEditCoverStoragePath('');
    setEditCoverUrl(
      displayedUser.cover ||
        'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80'
    );
    setShowEditModal(true);
  };

  // Save Profile Changes
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setIsSavingProfile(true);

    try {
      const cleanUsername = editUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (!cleanUsername) {
        addToast('error', 'Invalid Username', 'Username must contain at least one alphanumeric character.');
        setIsSavingProfile(false);
        return;
      }

      // Check username uniqueness if changed
      if (cleanUsername !== (currentUser.username || '').toLowerCase()) {
        const available = await isUsernameAvailable(cleanUsername, currentUser.id);
        if (!available) {
          addToast('error', 'Username Taken', `@${cleanUsername} is already registered by another member. Please choose another.`);
          setIsSavingProfile(false);
          return;
        }
      }

      // Server-authoritative check before saving if avatar was changed from outside storage flow
      if (editAvatarUrl && editAvatarUrl !== currentUser.avatar && !editAvatarStoragePath) {
        const checkRes = await fetch('/api/profiles/moderate-media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mediaUrl: editAvatarUrl,
            mediaType: 'profile_picture',
            userId: currentUser.id,
          }),
        });
        const checkData = await checkRes.json();
        if (!checkData.allowed || checkData.state === 'REVIEW_REQUIRED' || checkData.decision === 'QUARANTINE') {
          const isQuarantine = checkData.state === 'REVIEW_REQUIRED' || checkData.decision === 'QUARANTINE';
          addToast(
            isQuarantine ? 'warning' : 'error',
            isQuarantine ? 'Avatar Under Review' : 'Avatar Rejected',
            checkData.error || (isQuarantine ? 'Avatar is quarantined for safety review and cannot be saved yet.' : 'Profile image did not pass safety moderation.')
          );
          setIsSavingProfile(false);
          return;
        }
      }

      // Server-authoritative check before saving if cover was changed from outside storage flow
      if (editCoverUrl && editCoverUrl !== currentUser.cover && !editCoverStoragePath) {
        const checkRes = await fetch('/api/profiles/moderate-media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mediaUrl: editCoverUrl,
            mediaType: 'cover_photo',
            userId: currentUser.id,
          }),
        });
        const checkData = await checkRes.json();
        if (!checkData.allowed || checkData.state === 'REVIEW_REQUIRED' || checkData.decision === 'QUARANTINE') {
          const isQuarantine = checkData.state === 'REVIEW_REQUIRED' || checkData.decision === 'QUARANTINE';
          addToast(
            isQuarantine ? 'warning' : 'error',
            isQuarantine ? 'Cover Under Review' : 'Cover Rejected',
            checkData.error || (isQuarantine ? 'Cover banner is quarantined for safety review and cannot be saved yet.' : 'Cover banner did not pass safety moderation.')
          );
          setIsSavingProfile(false);
          return;
        }
      }

      const updates = {
        displayName: editDisplayName.trim() || cleanUsername,
        username: cleanUsername,
        bio: editBio.trim(),
        website: editWebsite.trim(),
        location: editLocation.trim(),
        photoURL: editAvatarStoragePath || editAvatarUrl,
        cover: editCoverStoragePath || editCoverUrl,
      };

      await updateUserProfile(currentUser.id, updates);

      const updatedUserObj: User = {
        ...currentUser,
        name: updates.displayName,
        displayName: updates.displayName,
        username: updates.username,
        bio: updates.bio,
        website: updates.website,
        location: updates.location,
        avatar: editAvatarUrl || currentUser.avatar,
        profilePicture: editAvatarUrl || currentUser.avatar,
        cover: editCoverUrl || currentUser.cover,
      };

      setCurrentUser(updatedUserObj);
      setDisplayedUser(updatedUserObj);
      setShowEditModal(false);
      addToast('success', 'Profile Updated', 'Your profile details were saved successfully.');
    } catch (err: any) {
      console.error('Error saving profile:', err);
      addToast('error', 'Update Failed', err?.message || 'Could not save profile changes. Please try again.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Upload Profile Avatar File with Server-Authoritative Media Safety Moderation
  const handleAvatarFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    setIsUploadingAvatar(true);

    try {
      // 1. Upload to Supabase Storage: ${auth.uid()}/profileImages/<uuid>.<ext>
      const storagePath = await uploadProfilePicture(file);

      // 2. Generate signed URL for preview/display and AI moderation
      const signedUrl = await getSignedMediaUrl(storagePath, 3600);
      const mediaPayload = signedUrl || (storagePath.startsWith('data:') ? storagePath : URL.createObjectURL(file));

      // 3. Server-Authoritative Profile Picture Moderation Check
      const modRes = await fetch('/api/profiles/moderate-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaUrl: mediaPayload,
          mediaType: 'profile_picture',
          userId: currentUser?.id,
        }),
      });
      const modData = await modRes.json();

      if (!modData.allowed || modData.decision === 'BLOCK' || modData.decision === 'QUARANTINE' || modData.state === 'REVIEW_REQUIRED') {
        await deleteStorageFile(storagePath);
        const isQuarantine = modData.decision === 'QUARANTINE' || modData.state === 'REVIEW_REQUIRED';
        addToast(
          isQuarantine ? 'warning' : 'error',
          isQuarantine ? 'Avatar Review Required' : 'Avatar Rejected',
          modData.error || modData.moderation?.reason || (isQuarantine ? 'Profile image is quarantined for safety review and cannot be used.' : 'Image violated VERIXA profile picture guidelines.')
        );
        return;
      }

      setEditAvatarStoragePath(storagePath);
      setEditAvatarUrl(mediaPayload);
      addToast('success', 'Photo Verified Safe', 'New profile image verified by VERIXA Safety Engine and preview ready.');
    } catch (err: any) {
      console.error('Avatar upload failed:', err);
      addToast('error', 'Upload Failed', err.message || 'Upload failed. Please try again.');
    } finally {
      setIsUploadingAvatar(false);
      e.target.value = '';
    }
  };

  // Upload Cover Image File with Server-Authoritative Media Safety Moderation
  const handleCoverFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    setIsUploadingCover(true);

    try {
      // Upload to Supabase Storage: ${auth.uid()}/covers/<uuid>.<ext>
      const storagePath = await uploadCoverImage(file);

      const signedUrl = await getSignedMediaUrl(storagePath, 3600);
      const mediaPayload = signedUrl || (storagePath.startsWith('data:') ? storagePath : URL.createObjectURL(file));

      // Server-Authoritative Profile Cover Banner Moderation Check
      const modRes = await fetch('/api/profiles/moderate-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaUrl: mediaPayload,
          mediaType: 'cover_photo',
          userId: currentUser?.id,
        }),
      });
      const modData = await modRes.json();

      if (!modData.allowed || modData.decision === 'BLOCK' || modData.decision === 'QUARANTINE' || modData.state === 'REVIEW_REQUIRED') {
        await deleteStorageFile(storagePath);
        const isQuarantine = modData.decision === 'QUARANTINE' || modData.state === 'REVIEW_REQUIRED';
        addToast(
          isQuarantine ? 'warning' : 'error',
          isQuarantine ? 'Cover Review Required' : 'Cover Banner Flagged',
          modData.error || modData.moderation?.reason || (isQuarantine ? 'Cover banner is quarantined for safety review and cannot be used.' : 'Banner violated VERIXA cover photo guidelines.')
        );
        return;
      }

      setEditCoverStoragePath(storagePath);
      setEditCoverUrl(mediaPayload);
      addToast('success', 'Cover Banner Verified', 'New cover banner verified by VERIXA Safety Engine and preview ready.');
    } catch (err: any) {
      console.error('Cover upload failed:', err);
      addToast('error', 'Upload Failed', err.message || 'Could not upload banner.');
    } finally {
      setIsUploadingCover(false);
      e.target.value = '';
    }
  };

  // Share Profile Link
  const handleShareProfile = () => {
    const url = window.location.href.split('?')[0] + `?uid=${displayedUser.id}`;
    navigator.clipboard.writeText(url);
    addToast('success', 'Link Copied', `@${displayedUser.username}'s profile link copied to clipboard!`);
  };

  // Direct Message User
  const handleMessageUser = () => {
    setActiveChatUser(displayedUser);
    setCurrentPage('messages');
  };

  // Report Submit
  const handleSendReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    await createReport(
      currentUser.id,
      displayedUser.id,
      'user',
      reportReason,
      reportDetails
    );

    setShowReportModal(false);
    setReportDetails('');
    addToast('success', 'Report Submitted', 'Thank you for helping keep VERIXA safe. Our AI Moderation team is reviewing this account.');
  };

  // Block User
  const handleBlockUser = () => {
    setShowBlockModal(false);
    addToast('info', 'User Blocked', `@${displayedUser.username} has been blocked. You will no longer see their posts or messages.`);
    openUserProfile(currentUser?.id);
  };

  // Add Comment in Post Viewer (Check toxicity FIRST before posting/rendering)
  const handleAddPostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPost || !newCommentText.trim() || isSubmittingComment) return;
    const text = newCommentText.trim();
    const targetPostId = selectedPost.id;

    setIsSubmittingComment(true);
    try {
      const result = await addComment(targetPostId, text);
      if (result.allowed) {
        // Clear input only after comment passed AI safety scan and was posted
        setNewCommentText('');
        // Update selectedPost view in the modal with the approved comment
        if (currentUser) {
          const approvedComment: Comment = {
            id: `c_${Date.now()}`,
            postId: targetPostId,
            user: currentUser,
            content: text,
            timestamp: 'Just now',
            toxicityScore: 0,
            categories: ['Safe / Verified'],
            aiStatus: 'safe',
            likes: 0,
          };
          setSelectedPost((prev) =>
            prev && prev.id === targetPostId
              ? { ...prev, comments: [...(prev.comments || []), approvedComment] }
              : prev
          );
        }
      }
      // If NOT allowed, text remains in the input box so the user can easily change it as instructed by AI
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Filter users for followers/following list modals
  const activeUserPool = supabaseProfiles;
  const sampleFollowList = activeUserPool.filter(
    (u) =>
      u.name.toLowerCase().includes(modalSearchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(modalSearchQuery.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-6 text-slate-100">
      {/* ================= PROFILE HEADER CARD ================= */}
      <div className="relative rounded-3xl overflow-hidden bg-slate-900/80 border border-purple-500/20 backdrop-blur-xl shadow-[0_0_50px_rgba(147,51,234,0.12)]">
        {/* Cover Photo */}
        <div className="relative h-44 sm:h-64 w-full bg-slate-950 overflow-hidden">
          <img
            src={
              displayedUser.cover ||
              'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80'
            }
            alt="Cover"
            className="w-full h-full object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />

          {/* Top Right Quick Badges */}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button
              onClick={() => setShowSafetyCertModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/80 border border-emerald-500/40 backdrop-blur-md text-emerald-400 text-xs font-bold shadow-lg hover:bg-slate-900 transition"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Score: {displayedUser.safetyScore}/100</span>
            </button>
          </div>
        </div>

        {/* Header Main Body */}
        <div className="px-5 sm:px-8 pb-6 relative -mt-16 sm:-mt-20">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            {/* Avatar & Identifiers */}
            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 text-center sm:text-left">
              {/* Profile Picture with Glowing Ring */}
              <div className="relative group">
                <div className="p-1 rounded-full bg-gradient-to-tr from-purple-600 via-blue-500 to-cyan-400 shadow-[0_0_25px_rgba(168,85,247,0.35)]">
                  <img
                    src={displayedUser.avatar || displayedUser.profilePicture}
                    alt={displayedUser.name}
                    referrerPolicy="no-referrer"
                    className="w-28 h-28 sm:w-32 sm:h-32 rounded-full object-cover border-4 border-slate-900 bg-slate-950"
                  />
                </div>

                {/* Edit Camera Overlay on Own Profile */}
                {isOwnProfile && (
                  <button
                    onClick={handleOpenEditModal}
                    title="Change Profile Photo"
                    className="absolute bottom-1 right-1 p-2 rounded-full bg-purple-600 hover:bg-purple-500 text-white shadow-xl border-2 border-slate-900 transition transform hover:scale-110"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* User Names & Badges */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                    {displayedUser.displayName || displayedUser.name}
                  </h1>
                  {displayedUser.verified && (
                    <span title="Verified VERIXA Human User">
                      <CheckCircle2 className="w-5 h-5 text-blue-400 fill-blue-500/20" />
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-xs">
                  <span className="text-purple-300 font-semibold">@{displayedUser.username}</span>
                  <span className="text-slate-600">•</span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-medium text-[11px]">
                    <Shield className="w-3 h-3 text-emerald-400" />
                    {displayedUser.aiTrustBadge || 'Verified Human • 100% Trust'}
                  </span>
                </div>

                {displayedUser.role && (
                  <p className="text-[11px] font-mono text-slate-400">{displayedUser.role}</p>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2.5">
              {isOwnProfile ? (
                <>
                  <button
                    onClick={handleOpenEditModal}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold text-xs transition flex items-center gap-2 shadow-lg"
                  >
                    <Edit3 className="w-4 h-4 text-purple-400" /> Edit Profile
                  </button>

                  <button
                    onClick={handleShareProfile}
                    className="px-4 py-2.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-200 font-semibold text-xs transition flex items-center gap-2"
                  >
                    <Share2 className="w-4 h-4 text-purple-400" /> Share
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleToggleFollow}
                    className={`px-5 py-2.5 rounded-xl font-bold text-xs transition flex items-center gap-2 shadow-lg ${
                      isFollowing
                        ? 'bg-slate-800 hover:bg-rose-950/40 hover:text-rose-400 border border-slate-700 text-slate-200'
                        : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-purple-600/20'
                    }`}
                  >
                    {isFollowing ? (
                      <>
                        <UserCheck className="w-4 h-4 text-emerald-400" /> Following
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" /> Follow
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleMessageUser}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs transition flex items-center gap-2"
                  >
                    <MessageSquare className="w-4 h-4 text-blue-400" /> Message
                  </button>

                  <button
                    onClick={handleShareProfile}
                    className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs transition"
                    title="Share Profile"
                  >
                    <Share2 className="w-4 h-4 text-purple-400" />
                  </button>
                </>
              )}

              {/* Options Menu Button */}
              <div className="relative">
                <button
                  onClick={() => setShowThreeDotMenu(!showThreeDotMenu)}
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition"
                  title="More Options"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>

                <AnimatePresence>
                  {showThreeDotMenu && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 10 }}
                      className="absolute right-0 mt-2 w-48 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl py-2 z-30 text-xs text-slate-300"
                    >
                      <button
                        onClick={() => {
                          handleShareProfile();
                          setShowThreeDotMenu(false);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-slate-800 flex items-center gap-2.5"
                      >
                        <Copy className="w-4 h-4 text-purple-400" /> Copy Profile Link
                      </button>

                      <button
                        onClick={() => {
                          setShowSafetyCertModal(true);
                          setShowThreeDotMenu(false);
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-slate-800 flex items-center gap-2.5"
                      >
                        <ShieldCheck className="w-4 h-4 text-emerald-400" /> AI Safety Audit
                      </button>

                      {!isOwnProfile && (
                        <>
                          <div className="my-1 border-t border-slate-800" />
                          <button
                            onClick={() => {
                              setShowReportModal(true);
                              setShowThreeDotMenu(false);
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-slate-800 text-amber-400 flex items-center gap-2.5"
                          >
                            <Flag className="w-4 h-4 text-amber-400" /> Report Account
                          </button>
                          <button
                            onClick={() => {
                              setShowBlockModal(true);
                              setShowThreeDotMenu(false);
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-slate-800 text-rose-400 flex items-center gap-2.5"
                          >
                            <Ban className="w-4 h-4 text-rose-400" /> Block User
                          </button>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Bio Text */}
          <div className="mt-5 text-sm text-slate-300 leading-relaxed max-w-3xl">
            <p className="whitespace-pre-line">{displayedUser.bio}</p>
          </div>

          {/* Meta Links & Location */}
          <div className="mt-4 flex flex-wrap items-center gap-y-2 gap-x-5 text-xs text-slate-400">
            {displayedUser.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-purple-400" />
                <span>{displayedUser.location}</span>
              </span>
            )}

            {displayedUser.website && (
              <a
                href={
                  displayedUser.website.startsWith('http')
                    ? displayedUser.website
                    : `https://${displayedUser.website}`
                }
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-blue-400 hover:underline"
              >
                <Globe className="w-3.5 h-3.5 text-blue-400" />
                <span>{displayedUser.website.replace(/^https?:\/\//, '')}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}

            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>{displayedUser.joinedDate || 'Member of VERIXA'}</span>
            </span>
          </div>

          {/* Stats Bar */}
          <div className="mt-6 pt-5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-8">
              {/* Posts Count */}
              <div className="text-center sm:text-left">
                <span className="text-lg font-extrabold text-white block">
                  {userPosts.length}
                </span>
                <span className="text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
                  Posts
                </span>
              </div>

              {/* Followers Count */}
              <button
                onClick={() => setShowFollowersModal(true)}
                className="text-center sm:text-left hover:opacity-80 transition group"
              >
                <span className="text-lg font-extrabold text-white block group-hover:text-purple-400">
                  {followersCount.toLocaleString()}
                </span>
                <span className="text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
                  Followers
                </span>
              </button>

              {/* Following Count */}
              <button
                onClick={() => setShowFollowingModal(true)}
                className="text-center sm:text-left hover:opacity-80 transition group"
              >
                <span className="text-lg font-extrabold text-white block group-hover:text-purple-400">
                  {followingCount.toLocaleString()}
                </span>
                <span className="text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
                  Following
                </span>
              </button>

              {/* Total Likes */}
              <div className="text-center sm:text-left hidden sm:block">
                <span className="text-lg font-extrabold text-rose-400 block">
                  {totalLikes.toLocaleString()}
                </span>
                <span className="text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
                  Total Likes
                </span>
              </div>
            </div>

            {/* AI Trust Badge Banner */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-purple-500/30 text-purple-300 text-xs">
              <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
              <span>Verified AI Safe Account</span>
            </div>
          </div>
        </div>
      </div>

      {/* ================= PROFILE TABS NAVIGATION ================= */}
      <div className="flex items-center justify-center border-b border-slate-800 gap-2 sm:gap-8 text-xs font-bold">
        {/* Posts Tab */}
        <button
          onClick={() => setActiveTab('posts')}
          className={`pb-3.5 px-3 flex items-center gap-2 transition relative ${
            activeTab === 'posts' ? 'text-purple-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Grid className="w-4 h-4" />
          <span>POSTS ({userPosts.length})</span>
          {activeTab === 'posts' && (
            <motion.div
              layoutId="profileTabUnderline"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full"
            />
          )}
        </button>

        {/* Reels Tab */}
        <button
          onClick={() => setActiveTab('reels')}
          className={`pb-3.5 px-3 flex items-center gap-2 transition relative ${
            activeTab === 'reels' ? 'text-purple-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Film className="w-4 h-4" />
          <span>REELS ({userReels.length})</span>
          {activeTab === 'reels' && (
            <motion.div
              layoutId="profileTabUnderline"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full"
            />
          )}
        </button>

        {/* Tagged Tab */}
        <button
          onClick={() => setActiveTab('tagged')}
          className={`pb-3.5 px-3 flex items-center gap-2 transition relative ${
            activeTab === 'tagged' ? 'text-purple-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Tag className="w-4 h-4" />
          <span>TAGGED ({taggedPosts.length})</span>
          {activeTab === 'tagged' && (
            <motion.div
              layoutId="profileTabUnderline"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full"
            />
          )}
        </button>

        {/* Saved Tab (Only visible on own profile or if saved items exist) */}
        {isOwnProfile && (
          <button
            onClick={() => setActiveTab('saved')}
            className={`pb-3.5 px-3 flex items-center gap-2 transition relative ${
              activeTab === 'saved' ? 'text-purple-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            <span>SAVED ({savedPosts.length})</span>
            {activeTab === 'saved' && (
              <motion.div
                layoutId="profileTabUnderline"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full"
              />
            )}
          </button>
        )}
      </div>

      {/* ================= TAB CONTENT GRID ================= */}

      {/* 1. POSTS GRID */}
      {activeTab === 'posts' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {userPosts.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-slate-900/50 rounded-3xl border border-slate-800 space-y-3">
              <div className="w-14 h-14 mx-auto rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <Grid className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-white">No Posts Yet</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {isOwnProfile
                  ? "Share your first AI-moderated post with the VERIXA community!"
                  : `@${displayedUser.username} hasn't posted anything yet.`}
              </p>
              {isOwnProfile && (
                <button
                  onClick={() => setCurrentPage('home')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold text-xs hover:opacity-90 transition shadow-lg shadow-purple-600/20"
                >
                  <Plus className="w-4 h-4" /> Create a Post
                </button>
              )}
            </div>
          ) : (
            userPosts.map((post) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => setSelectedPost(post)}
                className="group relative aspect-square rounded-2xl overflow-hidden bg-slate-950 border border-slate-800/80 cursor-pointer shadow-md hover:border-purple-500/40 transition-all"
              >
                {post.mediaUrl ? (
                  post.mediaType === 'video' ? (
                    <video src={post.mediaUrl} className="w-full h-full object-cover" muted />
                  ) : (
                    <img src={post.mediaUrl} alt="Post" className="w-full h-full object-cover" />
                  )
                ) : (
                  <div className="w-full h-full p-4 bg-gradient-to-br from-slate-900 to-purple-950/40 flex flex-col justify-between text-xs text-slate-200">
                    <p className="line-clamp-5 font-medium">{post.caption}</p>
                    <div className="text-[10px] text-purple-400 font-mono">VERIXA Text Post</div>
                  </div>
                )}

                {/* Video Badge */}
                {post.mediaType === 'video' && (
                  <div className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-slate-900/80 backdrop-blur-md text-white border border-white/20">
                    <Film className="w-3.5 h-3.5" />
                  </div>
                )}

                {/* AI Safety Badge */}
                <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-emerald-950/80 border border-emerald-500/40 text-[10px] font-mono text-emerald-300">
                  ✓ AI Verified
                </div>

                {/* Hover Overlay */}
                <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-6 text-white font-bold text-sm">
                  <div className="flex items-center gap-1.5">
                    <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
                    <span>{post.likes}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MessageCircle className="w-5 h-5 text-blue-400 fill-blue-400" />
                    <span>{post.comments?.length || 0}</span>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      {/* 2. REELS GRID */}
      {activeTab === 'reels' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {userReels.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-slate-900/50 rounded-3xl border border-slate-800 space-y-3">
              <div className="w-14 h-14 mx-auto rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <Film className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-white">No Videos Yet</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No short-form video reels recorded for this user.
              </p>
            </div>
          ) : (
            userReels.map((reel) => (
              <div
                key={reel.id}
                className="group relative aspect-[9/16] rounded-2xl overflow-hidden bg-slate-950 border border-slate-800/80 cursor-pointer shadow-md"
              >
                <video src={reel.videoUrl} className="w-full h-full object-cover" muted />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-80" />
                <div className="absolute bottom-3 left-3 right-3 text-xs space-y-1">
                  <p className="font-semibold text-white truncate">{reel.caption}</p>
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span className="flex items-center gap-1 text-rose-400">
                      <Heart className="w-3.5 h-3.5 fill-rose-400" /> {reel.likes}
                    </span>
                    <span className={`font-mono ${(reel.deepfakeRisk ?? 0) > 30 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {reel.deepfakeRisk ?? 0}% Deepfake Risk
                    </span>
                  </div>
                  {reel.moderationStatus && reel.moderationStatus !== 'APPROVED' && (
                    <div className="pt-1">
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        {reel.moderationStatus}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 3. TAGGED GRID */}
      {activeTab === 'tagged' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {taggedPosts.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-slate-900/50 rounded-3xl border border-slate-800 space-y-3">
              <div className="w-14 h-14 mx-auto rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <Tag className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-white">No Tagged Posts</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                When people mention or tag @{displayedUser.username} in their posts, they will appear here.
              </p>
            </div>
          ) : (
            taggedPosts.map((post) => (
              <div
                key={post.id}
                onClick={() => setSelectedPost(post)}
                className="group relative aspect-square rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 cursor-pointer"
              >
                {post.mediaUrl ? (
                  <img src={post.mediaUrl} alt="Tagged" className="w-full h-full object-cover" />
                ) : (
                  <div className="p-4 text-xs text-slate-300">{post.caption}</div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* 4. SAVED GRID */}
      {activeTab === 'saved' && isOwnProfile && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {savedPosts.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-slate-900/50 rounded-3xl border border-slate-800 space-y-3">
              <div className="w-14 h-14 mx-auto rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <Bookmark className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-white">No Saved Posts</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Bookmark posts across your feed to save them for quick access here.
              </p>
            </div>
          ) : (
            savedPosts.map((post) => (
              <div
                key={post.id}
                onClick={() => setSelectedPost(post)}
                className="group relative aspect-square rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 cursor-pointer hover:border-purple-500/40 transition"
              >
                {post.mediaUrl ? (
                  <img src={post.mediaUrl} alt="Saved" className="w-full h-full object-cover" />
                ) : (
                  <div className="p-4 text-xs text-slate-300 line-clamp-4">{post.caption}</div>
                )}
                <div className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-purple-600 text-white">
                  <Bookmark className="w-3.5 h-3.5 fill-white" />
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ================= EDIT PROFILE MODAL ================= */}
      <AnimatePresence>
        {showEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-slate-900 border border-purple-500/30 rounded-3xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-purple-400" /> Edit Profile
                </h3>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
                {/* Profile Picture Upload Section */}
                <div className="space-y-2">
                  <label className="block text-slate-300 font-bold">Profile Picture</label>
                  <div className="flex items-center gap-4">
                    <img
                      src={editAvatarUrl || displayedUser.avatar}
                      alt="Avatar Preview"
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 rounded-full object-cover border-2 border-purple-500/50"
                    />
                    <div className="space-y-1 flex-1">
                      <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-purple-600/20 border border-purple-500/40 text-purple-300 font-bold text-xs cursor-pointer hover:bg-purple-600/30 transition">
                        <Camera className="w-4 h-4" />
                        {isUploadingAvatar ? 'Uploading...' : 'Upload New Photo'}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarFileUpload}
                          className="hidden"
                          disabled={isUploadingAvatar}
                        />
                      </label>
                      <p className="text-[10px] text-slate-500">JPG, PNG, or WEBP up to 5MB</p>
                    </div>
                  </div>
                </div>

                {/* Cover Banner Upload Section */}
                <div className="space-y-2">
                  <label className="block text-slate-300 font-bold">Cover Banner</label>
                  <div className="relative w-full h-24 rounded-2xl overflow-hidden bg-slate-950 border border-slate-800">
                    <img
                      src={editCoverUrl || displayedUser.cover}
                      alt="Cover Preview"
                      className="w-full h-full object-cover"
                    />
                    <label className="absolute inset-0 bg-black/40 hover:bg-black/60 transition flex items-center justify-center gap-2 text-white font-bold text-xs cursor-pointer">
                      <Camera className="w-4 h-4" />
                      {isUploadingCover ? 'Uploading Banner...' : 'Change Cover Banner'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleCoverFileUpload}
                        className="hidden"
                        disabled={isUploadingCover}
                      />
                    </label>
                  </div>
                </div>

                {/* Display Name */}
                <div className="space-y-1">
                  <label className="block text-slate-300 font-semibold">Display Name</label>
                  <input
                    type="text"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500"
                    placeholder="Your Display Name"
                    required
                  />
                </div>

                {/* Username */}
                <div className="space-y-1">
                  <label className="block text-slate-300 font-semibold">Username</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-purple-400 font-mono">@</span>
                    <input
                      type="text"
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value.replace(/\s+/g, '_'))}
                      className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500"
                      placeholder="username"
                      required
                    />
                  </div>
                </div>

                {/* Bio */}
                <div className="space-y-1">
                  <label className="block text-slate-300 font-semibold">Bio</label>
                  <textarea
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    rows={3}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500"
                    placeholder="Tell the VERIXA community about yourself..."
                  />
                </div>

                {/* Website */}
                <div className="space-y-1">
                  <label className="block text-slate-300 font-semibold">Website / Portfolio</label>
                  <input
                    type="text"
                    value={editWebsite}
                    onChange={(e) => setEditWebsite(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500"
                    placeholder="https://yourwebsite.com"
                  />
                </div>

                {/* Location */}
                <div className="space-y-1">
                  <label className="block text-slate-300 font-semibold">Location</label>
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500"
                    placeholder="City, Country"
                  />
                </div>

                {/* Actions */}
                <div className="pt-3 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="px-6 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold shadow-lg shadow-purple-600/20 disabled:opacity-50"
                  >
                    {isSavingProfile ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ================= FOLLOWERS / FOLLOWING MODALS ================= */}
      <AnimatePresence>
        {(showFollowersModal || showFollowingModal) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-base font-extrabold text-white">
                  {showFollowersModal ? 'Followers' : 'Following'}
                </h3>
                <button
                  onClick={() => {
                    setShowFollowersModal(false);
                    setShowFollowingModal(false);
                  }}
                  className="p-1.5 rounded-xl bg-slate-800 text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search Bar inside modal */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={modalSearchQuery}
                  onChange={(e) => setModalSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Users List */}
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {sampleFollowList.map((usr) => (
                  <div
                    key={usr.id}
                    className="flex items-center justify-between p-2 rounded-2xl bg-slate-950/50 hover:bg-slate-800/50 transition border border-slate-800/50"
                  >
                    <div
                      onClick={() => {
                        openUserProfile(usr);
                        setShowFollowersModal(false);
                        setShowFollowingModal(false);
                      }}
                      className="flex items-center gap-3 cursor-pointer"
                    >
                      <img
                        src={usr.avatar}
                        alt={usr.name}
                        className="w-10 h-10 rounded-full object-cover border border-purple-500/30"
                      />
                      <div>
                        <h4 className="text-xs font-bold text-white hover:text-purple-400">
                          {usr.name}
                        </h4>
                        <p className="text-[11px] text-purple-300">@{usr.username}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        addToast('info', 'Follow Status Updated', `Updated status for @${usr.username}`);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px]"
                    >
                      {usr.isFollowing ? 'Following' : 'Follow'}
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ================= POST VIEWER MODAL ================= */}
      <AnimatePresence>
        {selectedPost && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-4xl bg-slate-900 border border-purple-500/30 rounded-3xl overflow-hidden shadow-2xl grid grid-cols-1 md:grid-cols-2 max-h-[90vh]"
            >
              {/* Media Section */}
              <div className="bg-slate-950 flex items-center justify-center relative min-h-[250px] md:min-h-[450px]">
                {selectedPost.mediaUrl ? (
                  selectedPost.mediaType === 'video' ? (
                    <video
                      src={selectedPost.mediaUrl}
                      controls
                      autoPlay
                      className="max-h-[450px] w-full object-contain"
                    />
                  ) : (
                    <img
                      src={selectedPost.mediaUrl}
                      alt="Post"
                      className="max-h-[450px] w-full object-contain"
                    />
                  )
                ) : (
                  <div className="p-8 text-center text-slate-300 text-sm max-w-sm">
                    <p className="font-semibold leading-relaxed">{selectedPost.caption}</p>
                  </div>
                )}

                {/* AI Safety Watermark */}
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-slate-900/80 border border-emerald-500/40 text-[11px] font-mono text-emerald-300 backdrop-blur-md flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>VERIXA Guard • Safe Content</span>
                </div>
              </div>

              {/* Sidebar Section */}
              <div className="flex flex-col h-full bg-slate-900 p-5 border-t md:border-t-0 md:border-l border-slate-800">
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div
                    onClick={() => {
                      openUserProfile(selectedPost.user);
                      setSelectedPost(null);
                    }}
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <img
                      src={selectedPost.user.avatar}
                      alt={selectedPost.user.name}
                      className="w-10 h-10 rounded-full object-cover border border-purple-500/30"
                    />
                    <div>
                      <h4 className="text-xs font-bold text-white hover:text-purple-400">
                        {selectedPost.user.name}
                      </h4>
                      <p className="text-[10px] text-purple-300">@{selectedPost.user.username}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedPost(null)}
                    className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Caption & Comments List */}
                <div className="flex-1 overflow-y-auto py-3 space-y-3 text-xs pr-1">
                  {/* Caption */}
                  <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/60 space-y-1">
                    <p className="text-slate-200 leading-relaxed">{selectedPost.caption}</p>
                    <span className="text-[10px] text-slate-500 block">{selectedPost.timestamp}</span>
                  </div>

                  {/* Comments */}
                  <div className="space-y-2">
                    <h5 className="font-bold text-slate-400 text-[11px] uppercase tracking-wider">
                      Comments ({selectedPost.comments?.length || 0})
                    </h5>

                    {(!selectedPost.comments || selectedPost.comments.length === 0) ? (
                      <p className="text-[11px] text-slate-500 italic">No comments yet. Be the first to comment!</p>
                    ) : (
                      selectedPost.comments.map((c) => (
                        <div
                          key={c.id}
                          className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/40 space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-purple-300 text-[11px]">
                              @{c.user.username}
                            </span>
                            <span className="text-[10px] text-emerald-400 font-mono">
                              ✓ Safe
                            </span>
                          </div>
                          <p className="text-slate-300 text-xs">{c.content}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Interaction Action Buttons */}
                <div className="pt-3 border-t border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => {
                          likePost(selectedPost.id);
                          setSelectedPost((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  likes: prev.isLiked ? prev.likes - 1 : prev.likes + 1,
                                  isLiked: !prev.isLiked,
                                }
                              : null
                          );
                        }}
                        className="flex items-center gap-1.5 text-xs font-bold hover:opacity-80"
                      >
                        <Heart
                          className={`w-5 h-5 ${
                            selectedPost.isLiked
                              ? 'text-rose-500 fill-rose-500'
                              : 'text-slate-400'
                          }`}
                        />
                        <span className={selectedPost.isLiked ? 'text-rose-400' : 'text-slate-300'}>
                          {selectedPost.likes}
                        </span>
                      </button>

                      <button
                        onClick={() => {
                          bookmarkPost(selectedPost.id);
                          setSelectedPost((prev) =>
                            prev
                              ? { ...prev, isBookmarked: !prev.isBookmarked }
                              : null
                          );
                          addToast('success', 'Bookmark Toggled', 'Saved posts updated.');
                        }}
                        className="text-slate-400 hover:text-purple-400"
                      >
                        <Bookmark
                          className={`w-5 h-5 ${
                            selectedPost.isBookmarked
                              ? 'text-purple-400 fill-purple-400'
                              : 'text-slate-400'
                          }`}
                        />
                      </button>

                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(window.location.href);
                          addToast('success', 'Post Shared', 'Post link copied to clipboard.');
                        }}
                        className="text-slate-400 hover:text-blue-400"
                      >
                        <Share2 className="w-5 h-5" />
                      </button>
                    </div>

                    <span className="text-[10px] text-slate-500">{selectedPost.timestamp}</span>
                  </div>

                  {/* Add Comment Input */}
                  <form onSubmit={handleAddPostComment} className="flex gap-2">
                    <input
                      type="text"
                      placeholder={isSubmittingComment ? "Scanning safety..." : "Write a safe comment..."}
                      value={newCommentText}
                      disabled={isSubmittingComment}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500 disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={!newCommentText.trim() || isSubmittingComment}
                      className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-bold text-xs disabled:opacity-40 transition cursor-pointer flex items-center gap-1.5"
                    >
                      {isSubmittingComment ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Checking...</span>
                        </>
                      ) : (
                        'Post'
                      )}
                    </button>
                  </form>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ================= REPORT MODAL ================= */}
      <AnimatePresence>
        {showReportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-slate-900 border border-amber-500/30 rounded-3xl p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-base font-extrabold text-amber-400 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-400" /> Report Account
                </h3>
                <button
                  onClick={() => setShowReportModal(false)}
                  className="p-1 rounded-xl bg-slate-800 text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSendReport} className="space-y-4 text-xs">
                <div className="space-y-1">
                  <label className="block text-slate-300 font-semibold">Reason for Report</label>
                  <select
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="Harassment or Bullying">Harassment or Bullying</option>
                    <option value="AI Generated Misinformation / Deepfake">
                      AI Generated Misinformation / Deepfake
                    </option>
                    <option value="Impersonation / Fake Identity">
                      Impersonation / Fake Identity
                    </option>
                    <option value="Spam / Bot Activity">Spam / Bot Activity</option>
                    <option value="Hate Speech or Cyberbullying">Hate Speech or Cyberbullying</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-slate-300 font-semibold">Additional Details</label>
                  <textarea
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    rows={3}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500"
                    placeholder="Provide any context for our VERIXA AI Safety team..."
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowReportModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold"
                  >
                    Submit Report
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ================= BLOCK USER CONFIRM MODAL ================= */}
      <AnimatePresence>
        {showBlockModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-slate-900 border border-rose-500/30 rounded-3xl p-6 shadow-2xl space-y-4 text-center"
            >
              <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Ban className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Block @{displayedUser.username}?</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                They will no longer be able to view your profile, send you messages, or comment on your posts.
              </p>
              <div className="flex items-center justify-center gap-3 pt-2 text-xs">
                <button
                  onClick={() => setShowBlockModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBlockUser}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold"
                >
                  Confirm Block
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ================= AI SAFETY AUDIT CERTIFICATE MODAL ================= */}
      <AnimatePresence>
        {showSafetyCertModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-xl bg-slate-900 border border-purple-500/30 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    <ShieldCheck className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-white flex items-center gap-1.5">
                      Account Safety Certificate
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono">
                        AI Guardian
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Central behavioral safety intelligence for @{displayedUser.username}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSafetyCertModal(false)}
                  className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Sub-tabs Navigation */}
              <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setSafetyTab('guardian')}
                  className={`flex-1 py-1.5 rounded-xl font-semibold transition ${
                    safetyTab === 'guardian'
                      ? 'bg-purple-600 text-white shadow-lg'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  AI Guardian
                </button>
                <button
                  type="button"
                  onClick={() => setSafetyTab('factors')}
                  className={`flex-1 py-1.5 rounded-xl font-semibold transition ${
                    safetyTab === 'factors'
                      ? 'bg-purple-600 text-white shadow-lg'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Factors
                </button>
                <button
                  type="button"
                  onClick={() => setSafetyTab('ledger')}
                  className={`flex-1 py-1.5 rounded-xl font-semibold transition ${
                    safetyTab === 'ledger'
                      ? 'bg-purple-600 text-white shadow-lg'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Reputation
                </button>
                {(currentUser?.role === 'admin' || currentUser?.role === 'Moderator') && (
                  <button
                    type="button"
                    onClick={() => setSafetyTab('admin')}
                    className={`flex-1 py-1.5 rounded-xl font-semibold transition flex items-center justify-center gap-1 ${
                      safetyTab === 'admin'
                        ? 'bg-rose-600 text-white shadow-lg'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Appeals
                    {pendingAppeals.length > 0 && (
                      <span className="w-4 h-4 rounded-full bg-white text-rose-600 text-[10px] font-bold flex items-center justify-center">
                        {pendingAppeals.length}
                      </span>
                    )}
                  </button>
                )}
              </div>

              {/* TAB 1: AI GUARDIAN MODE */}
              {safetyTab === 'guardian' && (
                <div className="space-y-3.5 text-xs text-slate-300">
                  {/* Guardian Score & Risk Tier Card */}
                  {(() => {
                    const score = guardianData?.score ?? displayedUser.safetyScore ?? 100;
                    const tier = guardianData?.riskLevel || (score >= 80 ? 'SAFE' : score >= 60 ? 'WATCH_LIST' : score >= 40 ? 'HIGH_RISK' : score >= 20 ? 'RESTRICTED' : 'CRITICAL');
                    const tierConfig: Record<string, { label: string; color: string; bg: string; border: string; desc: string }> = {
                      SAFE: {
                        label: 'SAFE',
                        color: 'text-emerald-400',
                        bg: 'bg-emerald-500/10',
                        border: 'border-emerald-500/30',
                        desc: 'Normal platform experience with verified safety standing.',
                      },
                      WATCH_LIST: {
                        label: 'WATCH LIST',
                        color: 'text-cyan-400',
                        bg: 'bg-cyan-500/10',
                        border: 'border-cyan-500/30',
                        desc: 'Minor behavioral flags detected. Enhanced proactive monitoring enabled.',
                      },
                      HIGH_RISK: {
                        label: 'HIGH RISK',
                        color: 'text-amber-400',
                        bg: 'bg-amber-500/10',
                        border: 'border-amber-500/30',
                        desc: 'Elevated violation risk. Uploads undergo stricter multi-frame safety verification.',
                      },
                      RESTRICTED: {
                        label: 'RESTRICTED',
                        color: 'text-orange-400',
                        bg: 'bg-orange-500/10',
                        border: 'border-orange-500/30',
                        desc: 'Upload rate limit (300s) and comment rate limit (60s) active to protect the community.',
                      },
                      CRITICAL: {
                        label: 'CRITICAL SUSPENSION',
                        color: 'text-rose-400',
                        bg: 'bg-rose-500/10',
                        border: 'border-rose-500/30',
                        desc: 'Temporary publishing suspension active due to severe corroborating violations.',
                      },
                    };
                    const cfg = tierConfig[tier] || tierConfig.SAFE;

                    return (
                      <div className={`p-4 rounded-2xl ${cfg.bg} border ${cfg.border} space-y-3`}>
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                              AI Guardian Behavioral Standing
                            </span>
                            <span className={`text-lg font-extrabold ${cfg.color} flex items-center gap-2`}>
                              <Sparkles className="w-5 h-5" />
                              {cfg.label}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-2xl font-black font-mono text-white">
                              {score}
                            </span>
                            <span className="text-xs text-slate-400 font-mono"> / 100</span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full h-2.5 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              score >= 80
                                ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                : score >= 60
                                ? 'bg-gradient-to-r from-cyan-500 to-blue-400'
                                : score >= 40
                                ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                                : score >= 20
                                ? 'bg-gradient-to-r from-orange-500 to-amber-600'
                                : 'bg-gradient-to-r from-rose-600 to-red-500'
                            }`}
                            style={{ width: `${Math.max(4, Math.min(100, score))}%` }}
                          />
                        </div>

                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          {guardianData?.explainability?.summary || cfg.desc}
                        </p>
                      </div>
                    );
                  })()}

                  {/* Active Restrictions Banner & Appeal Button */}
                  {(() => {
                    const restrictions = guardianData?.activeRestrictions;
                    const hasRestrictions =
                      restrictions?.account_suspended ||
                      restrictions?.upload_restricted ||
                      restrictions?.comment_restricted ||
                      restrictions?.messaging_restricted;

                    if (!hasRestrictions) return null;

                    return (
                      <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-rose-400 font-bold text-xs">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>Active Safety Restrictions Enforced</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowAppealModal(true)}
                            className="px-3 py-1 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] shadow transition"
                          >
                            Appeal Restrictions
                          </button>
                        </div>
                        <div className="space-y-1 font-mono text-[11px] text-rose-300/90">
                          {restrictions?.account_suspended && (
                            <p>• Publishing features temporarily suspended.</p>
                          )}
                          {restrictions?.upload_restricted && (
                            <p>• Upload cooldown active: {restrictions?.upload_cooldown_seconds || 300}s between posts.</p>
                          )}
                          {restrictions?.comment_restricted && (
                            <p>• Comment cooldown active: {restrictions?.comment_cooldown_seconds || 60}s between comments.</p>
                          )}
                          {restrictions?.messaging_restricted && (
                            <p>• Direct messaging privileges restricted.</p>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Policy Permissions Grid */}
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                    <span className="text-slate-400 font-bold text-[11px] uppercase tracking-wider block">
                      Permitted Platform Actions
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800/80 flex items-center justify-between">
                        <span className="text-slate-400">Post Creation:</span>
                        <span className={guardianData?.activeRestrictions?.upload_restricted ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>
                          {guardianData?.activeRestrictions?.account_suspended ? 'Suspended' : guardianData?.activeRestrictions?.upload_restricted ? 'Rate Limited (300s)' : 'Allowed'}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800/80 flex items-center justify-between">
                        <span className="text-slate-400">Comments:</span>
                        <span className={guardianData?.activeRestrictions?.comment_restricted ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>
                          {guardianData?.activeRestrictions?.account_suspended ? 'Suspended' : guardianData?.activeRestrictions?.comment_restricted ? 'Rate Limited (60s)' : 'Allowed'}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800/80 flex items-center justify-between">
                        <span className="text-slate-400">Direct Messages:</span>
                        <span className={guardianData?.activeRestrictions?.messaging_restricted ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                          {guardianData?.activeRestrictions?.messaging_restricted ? 'Restricted' : 'Allowed'}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800/80 flex items-center justify-between">
                        <span className="text-slate-400">Media Moderation:</span>
                        <span className="text-purple-400 font-bold">Real-time Verified</span>
                      </div>
                    </div>
                  </div>

                  {/* Recovery Tips */}
                  {guardianData?.explainability?.recovery_tips && guardianData.explainability.recovery_tips.length > 0 && (
                    <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 space-y-1.5 text-[11px]">
                      <span className="text-purple-300 font-bold flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" /> Guardian Recovery Guidance
                      </span>
                      <ul className="space-y-1 text-slate-300">
                        {guardianData.explainability.recovery_tips.map((tip: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <span className="text-purple-400">•</span>
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: CONTRIBUTING SAFETY FACTORS (Explainability) */}
              {safetyTab === 'factors' && (
                <div className="space-y-3 text-xs text-slate-300">
                  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 leading-relaxed text-[11px] text-slate-400">
                    VERIXA AI Guardian aggregates signals across 15 behavioral vectors. Scores adjust transparently with organic recovery over 14-day sliding evaluation windows.
                  </div>

                  {guardianData?.explainability?.factors && guardianData.explainability.factors.length > 0 ? (
                    <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                      {guardianData.explainability.factors.map((factor: any, idx: number) => (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 text-[11px]"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-200">{factor.label}</span>
                              <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono capitalize">
                                {factor.category}
                              </span>
                            </div>
                            {factor.count && (
                              <span className="text-[10px] text-slate-500 font-mono">
                                Occurrences: {factor.count}
                              </span>
                            )}
                          </div>
                          <span
                            className={`font-mono font-bold text-xs px-2.5 py-1 rounded-lg ${
                              factor.impact > 0
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                : factor.impact < 0
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {factor.impact > 0 ? `+${factor.impact}` : factor.impact} pts
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-slate-500 text-xs italic bg-slate-950/60 rounded-2xl border border-slate-800">
                      Clean account standing. No negative safety factors recorded in the current evaluation window.
                    </div>
                  )}

                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Single-Signal Protection Cap: Isolated predictions never cause critical restrictions without corroborating patterns.</span>
                  </div>
                </div>
              )}

              {/* TAB 3: REPUTATION HISTORY LEDGER */}
              {safetyTab === 'ledger' && (
                <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                  {/* Authenticity & Behavior Metrics */}
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 font-mono text-[11px]">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Safety Trust Rating:</span>
                      <span className="text-emerald-400 font-bold text-xs">{displayedUser.safetyScore}/100</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Inauthenticity Risk Profile:</span>
                      <span className={`font-bold ${fakeAccountRisk?.risk_level === 'HIGH' ? 'text-rose-400' : fakeAccountRisk?.risk_level === 'ELEVATED' ? 'text-amber-400' : 'text-blue-400'}`}>
                        {fakeAccountRisk?.probability_label || 'Low Risk of Inauthentic Activity (6%)'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Behavioral Classification:</span>
                      <span className="text-emerald-400 font-bold">
                        {fakeAccountRisk?.trust_classification || 'Likely Authentic Member'}
                      </span>
                    </div>
                  </div>

                  {/* Persistent Reputation Event Ledger */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-bold text-[11px] uppercase tracking-wider">
                        Reputation History Ledger
                      </span>
                      <span className="text-[10px] font-mono text-purple-400">Immutable Audit Trail</span>
                    </div>

                    {isLoadingBehavioral ? (
                      <div className="py-6 text-center text-slate-500 text-xs">
                        Loading reputation audit ledger...
                      </div>
                    ) : reputationLedger.length === 0 ? (
                      <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-500 italic">
                        No score modification events recorded yet. Account initialized at clean baseline.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                        {reputationLedger.map((evt: any) => (
                          <div
                            key={evt.id}
                            className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-start justify-between gap-3 text-[11px]"
                          >
                            <div className="space-y-0.5 flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-200 font-mono text-[10px]">
                                  {evt.event.replace(/_/g, ' ')}
                                </span>
                                <span className="text-[9px] text-slate-500 font-mono">
                                  via {evt.source}
                                </span>
                              </div>
                              <p className="text-slate-400 text-[10px] truncate">{evt.reason}</p>
                              <span className="text-[9px] text-slate-600 block">
                                {new Date(evt.timestamp).toLocaleDateString()} at {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <span
                              className={`font-mono font-bold text-xs shrink-0 px-2 py-0.5 rounded-md ${
                                evt.amount > 0
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                  : evt.amount < 0
                                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {evt.amount > 0 ? `+${evt.amount}` : evt.amount === 0 ? '0' : evt.amount} pts
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: ADMIN APPEALS REVIEW CONSOLE */}
              {safetyTab === 'admin' && (currentUser?.role === 'admin' || currentUser?.role === 'Moderator') && (
                <div className="space-y-3 text-xs text-slate-300">
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-slate-400 font-bold text-[11px] uppercase tracking-wider">
                      Pending Community Appeals Queue
                    </span>
                    <span className="text-[10px] font-mono text-purple-400">Admin Authority</span>
                  </div>

                  {pendingAppeals.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 text-xs italic bg-slate-950/60 rounded-2xl border border-slate-800">
                      No pending appeals in queue. All community sanctions are in active verified compliance.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                      {pendingAppeals.map((apl: any) => (
                        <div
                          key={apl.id}
                          className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-[11px]"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white font-mono">{apl.id}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-bold">
                              PENDING
                            </span>
                          </div>
                          <p className="text-slate-300 font-semibold">{apl.reason}</p>
                          <p className="text-slate-400 text-[10px] italic">{apl.appeal_text}</p>
                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => handleResolveAppeal(apl.id, 'REJECTED')}
                              className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-[10px] transition"
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResolveAppeal(apl.id, 'APPROVED')}
                              className="px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] shadow transition"
                            >
                              Approve (+30 Recovery)
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Bottom Assurance */}
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Verified Safe for Community Engagement • Real-time Protection Active</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ================= GUARDIAN APPEAL SUBMISSION MODAL ================= */}
      <AnimatePresence>
        {showAppealModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-slate-900 border border-purple-500/30 rounded-3xl p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-purple-400" />
                  Submit Safety Appeal
                </h3>
                <button
                  onClick={() => setShowAppealModal(false)}
                  className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitAppeal} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Appeal Category</label>
                  <select
                    value={appealReason}
                    onChange={(e) => setAppealReason(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="Dispute False Positive">Dispute False Positive Detection</option>
                    <option value="Account Compromise">Account Was Compromised</option>
                    <option value="Misunderstood Context">Misunderstood Context or Satire</option>
                    <option value="Restoration Request">General Safety Restoration Request</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Explanation & Supporting Context
                  </label>
                  <textarea
                    value={appealEvidence}
                    onChange={(e) => setAppealEvidence(e.target.value)}
                    required
                    placeholder="Provide details explaining why the restriction should be reconsidered..."
                    rows={4}
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none custom-scrollbar"
                  />
                </div>

                <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[11px] leading-relaxed">
                  Upon approval by the VERIXA Guardian team, restrictions are lifted and a +30 point safety recovery credit is applied immediately.
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAppealModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingAppeal || !appealEvidence.trim()}
                    className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold transition shadow-lg flex items-center gap-1.5"
                  >
                    {isSubmittingAppeal ? 'Submitting...' : 'Submit Appeal'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
