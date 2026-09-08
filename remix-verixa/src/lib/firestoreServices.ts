import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  increment,
  runTransaction,
  Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth, handleFirestoreError, OperationType } from './firebase';
import { User, Post, Comment, Notification, ChatMessage, ModerationAuditLog } from '../types';

// ================= USER PROFILES ================= //

export async function saveUserProfile(userData: {
  uid: string;
  username: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  bio?: string;
  role?: string;
}): Promise<User> {
  const userRef = doc(db, 'users', userData.uid);
  const path = `users/${userData.uid}`;
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 750)
    );
    const docSnap = await Promise.race([getDoc(userRef), timeoutPromise]);
    if (!docSnap.exists()) {
      const newUser = {
        uid: userData.uid,
        username: userData.username,
        displayName: userData.displayName || userData.username,
        email: userData.email,
        photoURL: userData.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
        bio: userData.bio || 'Safe social media explorer 🛡️',
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
        role: userData.role || 'Verified Member',
        aiTrustBadge: 'Verified Human • 100% Trust',
        safetyScore: 100,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isActive: true,
      };
      setDoc(userRef, newUser, { merge: true }).catch((err) => console.warn('User profile sync notice:', err));
      return {
        id: userData.uid,
        username: userData.username,
        name: newUser.displayName,
        avatar: newUser.photoURL,
        bio: newUser.bio,
        verified: true,
        aiTrustBadge: newUser.aiTrustBadge,
        safetyScore: newUser.safetyScore,
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
        role: newUser.role,
        joinedDate: 'Joined Today',
      };
    } else {
      const data = docSnap.data();
      return {
        id: data.uid || userData.uid,
        username: data.username || userData.username,
        name: data.displayName || userData.displayName || 'VERIXA Member',
        avatar: data.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
        bio: data.bio || 'Safe social media explorer 🛡️',
        verified: true,
        aiTrustBadge: data.aiTrustBadge || 'Verified Human • 100% Trust',
        safetyScore: data.safetyScore || 100,
        followersCount: data.followersCount || 0,
        followingCount: data.followingCount || 0,
        postsCount: data.postsCount || 0,
        role: data.role || 'Verified Member',
        joinedDate: data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString() : 'Joined Today',
      };
    }
  } catch (error: any) {
    if (error?.message?.includes('offline') || error?.code === 'unavailable' || error?.message === 'timeout') {
      console.info('Fast-path profile resolution: Returning immediate local profile.');
      return {
        id: userData.uid,
        username: userData.username,
        name: userData.displayName || userData.username,
        avatar: userData.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
        bio: userData.bio || 'Safe social media explorer 🛡️',
        verified: true,
        aiTrustBadge: 'Verified Human • 100% Trust',
        safetyScore: 100,
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
        role: userData.role || 'Verified Member',
        joinedDate: 'Joined Today',
      };
    }
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

export async function getUserProfile(uid: string): Promise<User | null> {
  const userRef = doc(db, 'users', uid);
  const path = `users/${uid}`;
  try {
    const docSnap = await getDoc(userRef);
    if (!docSnap.exists()) return null;
    const data = docSnap.data();
    return {
      id: data.uid || uid,
      uid: data.uid || uid,
      username: data.username || 'user',
      name: data.displayName || data.username || 'VERIXA Member',
      displayName: data.displayName,
      avatar: data.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
      profilePicture: data.photoURL,
      cover: data.cover || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80',
      bio: data.bio || 'Safe social media explorer 🛡️',
      website: data.website || '',
      location: data.location || '',
      email: data.email || '',
      verified: true,
      aiTrustBadge: data.aiTrustBadge || 'Verified Human • 100% Trust',
      safetyScore: data.safetyScore || 100,
      followersCount: data.followersCount || 0,
      followingCount: data.followingCount || 0,
      postsCount: data.postsCount || 0,
      role: data.role || 'Verified Member',
      joinedDate: data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString() : 'Joined Today',
    };
  } catch (error) {
    console.warn('getUserProfile error:', error);
    return null;
  }
}

export async function updateUserProfile(
  uid: string,
  updates: Partial<{
    displayName: string;
    username: string;
    bio: string;
    photoURL: string;
    website: string;
    location: string;
    cover: string;
  }>
) {
  const userRef = doc(db, 'users', uid);
  const path = `users/${uid}`;
  try {
    await updateDoc(userRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ================= POSTS ================= //

export async function createFirestorePost(postData: {
  userId: string;
  username: string;
  userPhotoURL: string;
  caption: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  aiScanDetails?: any;
}) {
  const postsColl = collection(db, 'posts');
  const path = 'posts';
  try {
    const postDocRef = doc(postsColl);
    const newPostData = {
      postId: postDocRef.id,
      userId: postData.userId,
      username: postData.username,
      userPhotoURL: postData.userPhotoURL,
      caption: postData.caption,
      mediaURL: postData.mediaUrl || null,
      mediaType: postData.mediaType || 'image',
      hashtags: postData.caption.match(/#[\w]+/g) || [],
      likesCount: 0,
      commentsCount: 0,
      visibility: 'public',
      moderationStatus: 'approved',
      aiSafetyScore: 99,
      aiScanDetails: postData.aiScanDetails || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(postDocRef, newPostData);

    // Increment user posts count
    const userRef = doc(db, 'users', postData.userId);
    await updateDoc(userRef, { postsCount: increment(1) }).catch(() => {});

    return postDocRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    throw error;
  }
}

export function subscribePosts(callback: (posts: Post[]) => void) {
  const postsQuery = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
  const path = 'posts';

  return onSnapshot(
    postsQuery,
    (snapshot) => {
      const postsList: Post[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        let timeFormatted = 'Just now';
        if (data.createdAt && (data.createdAt as Timestamp).seconds) {
          const date = new Date((data.createdAt as Timestamp).seconds * 1000);
          timeFormatted = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        return {
          id: docSnap.id,
          user: {
            id: data.userId || 'unknown',
            username: data.username || 'user',
            name: data.username || 'VERIXA User',
            avatar: data.userPhotoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
            bio: 'Safe social media explorer 🛡️',
            verified: true,
            aiTrustBadge: 'Verified Human • 100% Trust',
            safetyScore: 100,
            followersCount: 0,
            followingCount: 0,
            postsCount: 0,
            role: 'Verified Member',
            joinedDate: 'Joined Today',
          },
          caption: data.caption || '',
          mediaUrl: data.mediaURL || undefined,
          mediaType: data.mediaType || 'image',
          likes: data.likesCount || 0,
          comments: [],
          shares: 0,
          timestamp: timeFormatted,
          tags: data.hashtags || ['VERIXA', 'SafeMedia'],
          aiSafetyScore: data.aiSafetyScore || 99,
          aiScanDetails: data.aiScanDetails || undefined,
        };
      });
      callback(postsList);
    },
    (error) => {
      console.warn('Realtime posts snapshot warning:', error.message);
    }
  );
}

export async function deleteFirestorePost(postId: string, userId: string) {
  const postRef = doc(db, 'posts', postId);
  const path = `posts/${postId}`;
  try {
    await deleteDoc(postRef);
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { postsCount: increment(-1) }).catch(() => {});
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ================= LIKES ================= //

export async function togglePostLike(postId: string, userId: string, targetLiked?: boolean): Promise<boolean> {
  const likeRef = doc(db, 'posts', postId, 'likes', userId);
  const postRef = doc(db, 'posts', postId);
  const path = `posts/${postId}/likes/${userId}`;

  try {
    let shouldLike: boolean;
    if (targetLiked !== undefined) {
      shouldLike = targetLiked;
    } else {
      try {
        const likeSnap = await getDoc(likeRef);
        shouldLike = !likeSnap.exists();
      } catch (readErr: any) {
        if (readErr?.message?.includes('offline') || readErr?.code === 'unavailable') {
          shouldLike = true;
        } else {
          throw readErr;
        }
      }
    }

    if (!shouldLike) {
      // Unlike
      await deleteDoc(likeRef).catch((e) => {
        if (!e?.message?.includes('offline')) throw e;
      });
      await setDoc(postRef, { likesCount: increment(-1) }, { merge: true }).catch(() => {});
      return false;
    } else {
      // Like
      await setDoc(likeRef, {
        likeId: userId,
        postId,
        userId,
        createdAt: serverTimestamp(),
      }).catch((e) => {
        if (!e?.message?.includes('offline')) throw e;
      });
      await setDoc(postRef, { likesCount: increment(1) }, { merge: true }).catch(() => {});
      return true;
    }
  } catch (error: any) {
    if (error?.message?.includes('offline') || error?.code === 'unavailable') {
      console.warn(`Firestore offline during like operation on ${path}. Action preserved locally.`);
      return targetLiked ?? true;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
    return false;
  }
}

// ================= COMMENTS ================= //

export async function addFirestoreComment(postId: string, userId: string, username: string, userPhotoURL: string, text: string, toxicityScore: number = 0) {
  const commentsColl = collection(db, 'posts', postId, 'comments');
  const postRef = doc(db, 'posts', postId);
  const path = `posts/${postId}/comments`;

  try {
    const newCommentRef = doc(commentsColl);
    await setDoc(newCommentRef, {
      commentId: newCommentRef.id,
      postId,
      userId,
      username,
      userPhotoURL,
      text,
      toxicityScore,
      moderationStatus: 'approved',
      createdAt: serverTimestamp(),
    });

    await setDoc(postRef, { commentsCount: increment(1) }, { merge: true }).catch(() => {});
    return newCommentRef.id;
  } catch (error: any) {
    if (error?.message?.includes('offline') || error?.code === 'unavailable') {
      console.warn(`Firestore offline during comment creation on ${path}. Preserved locally.`);
      return `local_comment_${Date.now()}`;
    }
    handleFirestoreError(error, OperationType.CREATE, path);
    throw error;
  }
}

export function subscribePostComments(postId: string, callback: (comments: Comment[]) => void) {
  const commentsQuery = query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'));

  return onSnapshot(
    commentsQuery,
    (snapshot) => {
      const list: Comment[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        let timeFormatted = 'Just now';
        if (data.createdAt && (data.createdAt as Timestamp).seconds) {
          timeFormatted = new Date((data.createdAt as Timestamp).seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return {
          id: docSnap.id,
          postId,
          user: {
            id: data.userId,
            username: data.username,
            name: data.username,
            avatar: data.userPhotoURL,
            bio: '',
            verified: true,
            aiTrustBadge: 'Verified Human',
            safetyScore: 100,
            followersCount: 0,
            followingCount: 0,
            postsCount: 0,
            role: 'Member',
            joinedDate: '',
          },
          content: data.text,
          timestamp: timeFormatted,
          toxicityScore: data.toxicityScore || 0,
          categories: ['SAFE_CONTENT'],
          aiStatus: 'safe',
          likes: 0,
        };
      });
      callback(list);
    },
    (error) => {
      console.warn('Realtime comments warning:', error.message);
    }
  );
}

// ================= FOLLOWS ================= //

export async function toggleFollowUser(followerId: string, followingId: string, targetFollowing?: boolean): Promise<boolean> {
  const followId = `${followerId}_${followingId}`;
  const followRef = doc(db, 'follows', followId);
  const path = `follows/${followId}`;

  try {
    let shouldFollow: boolean;
    if (targetFollowing !== undefined) {
      shouldFollow = targetFollowing;
    } else {
      try {
        const snap = await getDoc(followRef);
        shouldFollow = !snap.exists();
      } catch (readErr: any) {
        if (readErr?.message?.includes('offline') || readErr?.code === 'unavailable') {
          shouldFollow = true;
        } else {
          throw readErr;
        }
      }
    }

    if (!shouldFollow) {
      await deleteDoc(followRef).catch((e) => {
        if (!e?.message?.includes('offline')) throw e;
      });
      await updateDoc(doc(db, 'users', followerId), { followingCount: increment(-1) }).catch(() => {});
      await updateDoc(doc(db, 'users', followingId), { followersCount: increment(-1) }).catch(() => {});
      return false;
    } else {
      await setDoc(followRef, {
        followId,
        followerId,
        followingId,
        createdAt: serverTimestamp(),
      }).catch((e) => {
        if (!e?.message?.includes('offline')) throw e;
      });
      await updateDoc(doc(db, 'users', followerId), { followingCount: increment(1) }).catch(() => {});
      await updateDoc(doc(db, 'users', followingId), { followersCount: increment(1) }).catch(() => {});
      return true;
    }
  } catch (error: any) {
    if (error?.message?.includes('offline') || error?.code === 'unavailable') {
      console.warn(`Firestore offline during follow on ${path}. Action preserved locally.`);
      return targetFollowing ?? true;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
    return false;
  }
}

// ================= NOTIFICATIONS ================= //

export async function createNotification(notif: {
  recipientId: string;
  senderId: string;
  senderUsername: string;
  senderPhotoURL: string;
  type: 'like' | 'comment' | 'follow' | 'mention';
  postId?: string;
  message: string;
}) {
  if (notif.recipientId === notif.senderId) return; // Don't notify self
  const notifRef = doc(collection(db, 'notifications'));
  const path = `notifications/${notifRef.id}`;
  try {
    await setDoc(notifRef, {
      notificationId: notifRef.id,
      recipientId: notif.recipientId,
      senderId: notif.senderId,
      senderUsername: notif.senderUsername,
      senderPhotoURL: notif.senderPhotoURL,
      type: notif.type,
      postId: notif.postId || null,
      message: notif.message,
      read: false,
      createdAt: serverTimestamp(),
    }).catch((e) => {
      if (!e?.message?.includes('offline')) throw e;
    });
  } catch (error: any) {
    if (error?.message?.includes('offline') || error?.code === 'unavailable') {
      return;
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeUserNotifications(userId: string, callback: (notifs: Notification[]) => void) {
  const notifQuery = query(collection(db, 'notifications'), where('recipientId', '==', userId), orderBy('createdAt', 'desc'));

  return onSnapshot(
    notifQuery,
    (snapshot) => {
      const list: Notification[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        let timeFormatted = 'Just now';
        if (data.createdAt && (data.createdAt as Timestamp).seconds) {
          timeFormatted = new Date((data.createdAt as Timestamp).seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        const notifType: Notification['type'] =
          data.type === 'like'
            ? 'like'
            : data.type === 'comment'
            ? 'comment'
            : data.type === 'follow'
            ? 'follow'
            : 'ai_warning';

        return {
          id: docSnap.id,
          type: notifType,
          user: {
            id: data.senderId,
            username: data.senderUsername || 'User',
            name: data.senderUsername || 'User',
            avatar: data.senderPhotoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
            bio: '',
            verified: true,
            aiTrustBadge: 'Verified Human',
            safetyScore: 100,
            followersCount: 0,
            followingCount: 0,
            postsCount: 0,
            role: 'Member',
            joinedDate: '',
          },
          text: data.message || 'New notification',
          timestamp: timeFormatted,
          read: data.read || false,
        };
      });
      callback(list);
    },
    (error) => {
      console.warn('Notifications snapshot warning:', error.message);
    }
  );
}

// ================= SAVED POSTS ================= //

export async function toggleSavePost(userId: string, postId: string, targetSaved?: boolean): Promise<boolean> {
  const saveId = `${userId}_${postId}`;
  const saveRef = doc(db, 'savedPosts', saveId);
  const path = `savedPosts/${saveId}`;

  try {
    let shouldSave: boolean;
    if (targetSaved !== undefined) {
      shouldSave = targetSaved;
    } else {
      try {
        const snap = await getDoc(saveRef);
        shouldSave = !snap.exists();
      } catch (readErr: any) {
        if (readErr?.message?.includes('offline') || readErr?.code === 'unavailable') {
          shouldSave = true;
        } else {
          throw readErr;
        }
      }
    }

    if (!shouldSave) {
      await deleteDoc(saveRef).catch((e) => {
        if (!e?.message?.includes('offline')) throw e;
      });
      return false;
    } else {
      await setDoc(saveRef, {
        saveId,
        userId,
        postId,
        createdAt: serverTimestamp(),
      }).catch((e) => {
        if (!e?.message?.includes('offline')) throw e;
      });
      return true;
    }
  } catch (error: any) {
    if (error?.message?.includes('offline') || error?.code === 'unavailable') {
      console.warn(`Firestore offline during bookmark on ${path}. Action preserved locally.`);
      return targetSaved ?? true;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
    return false;
  }
}

// ================= DIRECT MESSAGING ================= //

export async function sendFirestoreMessage(senderId: string, receiverId: string, text: string, mediaUrl?: string) {
  const convId = [senderId, receiverId].sort().join('_');
  const convRef = doc(db, 'conversations', convId);
  const messagesColl = collection(db, 'conversations', convId, 'messages');
  const path = `conversations/${convId}/messages`;

  try {
    await setDoc(convRef, {
      conversationId: convId,
      participants: [senderId, receiverId],
      lastMessage: text,
      updatedAt: serverTimestamp(),
    }, { merge: true }).catch((e) => {
      if (!e?.message?.includes('offline')) throw e;
    });

    const msgRef = doc(messagesColl);
    await setDoc(msgRef, {
      messageId: msgRef.id,
      conversationId: convId,
      senderId,
      receiverId,
      text,
      mediaUrl: mediaUrl || null,
      isAIVerified: true,
      createdAt: serverTimestamp(),
    }).catch((e) => {
      if (!e?.message?.includes('offline')) throw e;
    });

    return msgRef.id;
  } catch (error: any) {
    if (error?.message?.includes('offline') || error?.code === 'unavailable') {
      console.warn(`Firestore offline during send message on ${path}. Preserved locally.`);
      return `local_msg_${Date.now()}`;
    }
    handleFirestoreError(error, OperationType.CREATE, path);
    throw error;
  }
}

export function subscribeFirestoreMessages(userId: string, otherUserId: string, callback: (messages: ChatMessage[]) => void) {
  const convId = [userId, otherUserId].sort().join('_');
  const msgsQuery = query(collection(db, 'conversations', convId, 'messages'), orderBy('createdAt', 'asc'));

  return onSnapshot(
    msgsQuery,
    (snapshot) => {
      const msgs: ChatMessage[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        let timeFormatted = 'Just now';
        if (data.createdAt && (data.createdAt as Timestamp).seconds) {
          timeFormatted = new Date((data.createdAt as Timestamp).seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return {
          id: docSnap.id,
          senderId: data.senderId,
          receiverId: data.receiverId,
          text: data.text,
          timestamp: timeFormatted,
          isAIVerified: data.isAIVerified ?? true,
          mediaUrl: data.mediaUrl || undefined,
        };
      });
      callback(msgs);
    },
    (error) => {
      console.warn('Realtime chat snapshot warning:', error.message);
    }
  );
}

// ================= REPORTS & AUDIT LOGS ================= //

export async function createReportFirestore(reporterId: string, targetId: string, targetType: 'post' | 'comment' | 'user', reason: string, description?: string) {
  const reportRef = doc(collection(db, 'reports'));
  const path = `reports/${reportRef.id}`;
  try {
    await setDoc(reportRef, {
      reportId: reportRef.id,
      reporterId,
      targetId,
      targetType,
      reason,
      description: description || '',
      status: 'pending',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function logModerationEvent(data: {
  targetId: string;
  targetType: 'post' | 'comment';
  userId: string;
  status: 'approved' | 'rejected' | 'flagged';
  category?: string;
  confidence?: number;
  reason?: string;
}) {
  const modRef = doc(collection(db, 'moderation'));
  const path = `moderation/${modRef.id}`;
  try {
    await setDoc(modRef, {
      moderationId: modRef.id,
      ...data,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// ================= STORAGE HELPERS ================= //

export async function uploadProfilePicture(uid: string, file: File): Promise<string> {
  const fileRef = ref(storage, `profileImages/${uid}/${Date.now()}_${file.name}`);
  await uploadBytes(fileRef, file);
  return await getDownloadURL(fileRef);
}

export async function uploadPostMedia(uid: string, file: File): Promise<string> {
  const fileRef = ref(storage, `posts/${uid}/${Date.now()}_${file.name}`);
  await uploadBytes(fileRef, file);
  return await getDownloadURL(fileRef);
}
