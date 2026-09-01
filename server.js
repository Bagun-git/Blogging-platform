const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const multer=require('multer');
const nodemailer=require('nodemailer');
const crypto=require('crypto');
require('dotenv').config();
//const bcrypt = require('bcrypt');

const app = express();
app.use(express.urlencoded({ extended: true }));
const session = require('express-session');

app.use(session({
  secret: 'blogsecret', // change this to something secure
  resave: false,
  saveUninitialized: true
}));

const PORT = 3000;

// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/userDB');
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'Connection error:'));
db.once('open', () => console.log('Connected to MongoDB'));

//setting EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'html'));

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'html')));
app.use('/images', express.static(path.join(__dirname, 'html/images')));
app.use(bodyParser.json());

// Schema
const userSchema = new mongoose.Schema({
    fullname: String,
    name:String,
    email:String,
    password: String,
    profilePic: String,
    bio: String,
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  notifications: [{ message: String, timestamp: Date }],
  resetToken:String,
  resetTokenExpires:Date
});
const User = mongoose.model('User', userSchema);

// Blog Schema
const blogSchema = new mongoose.Schema({
  title: String,
  content: String,
  tags: [String],
  imagePath: String,
  createdAt: { type: Date, default: Date.now },
  authorEmail: String,
  authorName: String,
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
   likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  dislikes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
});
const Blog = mongoose.model('Blog', blogSchema);

//// Multer (for image upload)
const storage = multer.diskStorage({
  destination: './html/images',
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

//message schema
const messageSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  text: String,
  file: String,
  createdAt: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

app.get('/messages', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const currentUser = await User.findOne({ email: req.session.user.email });
   const targetUserId = req.query.to;
   // Fetch distinct users you have chatted with
     const chats = await Message.aggregate([
    { $match: { $or: [ { from: currentUser._id }, { to: currentUser._id } ] } },
    { $group: {
      _id: {
        $cond: [
          { $eq: ["$from", currentUser._id] },
          "$to",
          "$from"
        ]
      }
    }}
  ]);
  const chatUserIds = chats.map(c => c._id);
  const chatUsers = await User.find({ _id: { $in: chatUserIds } });
  let targetUser = null;
  let messages = [];

  if (targetUserId && mongoose.Types.ObjectId.isValid(targetUserId)) {
    targetUser = await User.findById(targetUserId);
    if (targetUser) {
    messages = await Message.find({
      $or: [
        { from: currentUser._id, to: targetUser._id },
        { from: targetUser._id, to: currentUser._id }
      ]
    }).sort({ createdAt: 1 });
  }
}
  
  res.render('messages', { currentUser, targetUser, messages,chatUsers });
});
//message POST
app.post('/messages',upload.single('file'), async (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const currentUser = await User.findOne({ email: req.session.user.email });
  const { toUserId, text } = req.body;

 if (!mongoose.Types.ObjectId.isValid(toUserId)) {
    return res.redirect('/messages');
  }

  const targetUser = await User.findById(toUserId);
  if (!targetUser) return res.redirect('/messages');


 const newMsg = new Message({
    from: currentUser._id,
    to: targetUser._id,
     text: text?.trim() || '',
    file: req.file ? '/images/' + req.file.filename : null,
  });

  await newMsg.save();
  res.redirect(`/messages?to=${toUserId}`);
});
app.get('/signup', (req, res) => {
  res.render('signup', { error: null });
});

// Signup POST
app.post('/signup', async (req, res) => {
  const { fullname, email, password, confirmPassword } = req.body;

  if (password !== confirmPassword) {
    return res.render('signup', { error: 'Passwords do not match!' });

  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.render('signup', { error: 'Email already registered!' });

  }

  //const hashedpassword=await bcrypt.hash(password,10);(in next line password:hashedpassword)
  const newUser = new User({ fullname, email, password });
  await newUser.save();
  // ✅ Set session after signup
  req.session.user = {
    name: newUser.fullname,
    email: newUser.email,
    id:newUser._id
  };
  res.redirect('/home');
  
});
// ✅ Login GET route 
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});
// ✅ Forgot Password GET
app.get('/forgot-password', (req, res) => {
  res.render('forgot-password', { message: null });
});
// ✅ Forgot Password POST
app.post('/forgot-password', async (req, res) => {

    try {
        const { email } = req.body;

        const user = await User.findOne({ email });

        if (!user) {
            return res.render('forgot-password', {
                message: 'No account found with this email.'
            });
        }

        // Generate secure random token
        const resetToken = crypto.randomBytes(32).toString('hex');

        // Save token in database
        user.resetToken = resetToken;

        // Token valid for 15 minutes
        user.resetTokenExpires = Date.now() + 15 * 60 * 1000;

        await user.save();

        // Create reset link
        const resetLink =
            `http://localhost:3000/reset-password?token=${resetToken}`;

        // Email transporter
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        // Email
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Password Reset - MyBlogSpace',

            html: `
                <h2>Password Reset</h2>

                <p>You requested to reset your password.</p>

                <p>Click the button below:</p>

                <a href="${resetLink}"
                   style="
                   display:inline-block;
                   padding:10px 20px;
                   background:#007bff;
                   color:white;
                   text-decoration:none;
                   border-radius:5px;">
                   Reset Password
                </a>

                <p>This link will expire in 15 minutes.</p>

                <p>If you did not request this, ignore this email.</p>
            `
        };

        await transporter.sendMail(mailOptions);

        res.render('forgot-password', {
            message: 'Reset link sent to your email!'
        });

    } catch (error) {
        console.error('Forgot password error:', error);

        res.render('forgot-password', {
            message: 'Something went wrong. Please try again.'
        });
    }
});


// ✅ Reset Password GET
app.get('/reset-password', async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.send('Invalid reset link.');
        }

        const user = await User.findOne({
            resetToken: token,
            resetTokenExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.send('Reset link is invalid or expired.');
        }

        res.render('reset-password', {
            token: token,
            error: null
        });

    } catch (error) {
        console.error(error);
        res.send('Something went wrong.');
    }
});

// ✅ Reset Password POST
app.post('/reset-password', async (req, res) => {
    try {
        const {
            token,
            newPassword,
            confirmPassword
        } = req.body;

        if (newPassword !== confirmPassword) {
            return res.render('reset-password', {
                token,
                error: 'Passwords do not match.'
            });
        }

        const user = await User.findOne({
            resetToken: token,
            resetTokenExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.render('reset-password', {
                token,
                error: 'Reset link is invalid or expired.'
            });
        }

        // Change password
        user.password = newPassword;

        // Delete token so it cannot be reused
        user.resetToken = undefined;
        user.resetTokenExpires = undefined;

        await user.save();

        res.redirect('/login');

    } catch (error) {
        console.error('Reset password error:', error);

        res.render('reset-password', {
            token: req.body.token,
            error: 'Something went wrong. Please try again.'
        });
    }
});

// Login POST
app.post('/login', async (req, res) => {
  const { name, email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
  return res.render('login', { error: 'Email not found. Try again!' });
}

if (user.password !== password) {
  return res.render('login', { error: 'Wrong password. Try again!' });
}

if (!user.fullname.includes(name)) {
  return res.render('login', { error: 'Wrong name. Try again!' });
}
    req.session.user={
      id: user._id,
      name:user.fullname,
      email: user.email
    };
    res.redirect('/home');
  });
// 🆕 Get Home Page with All Blogs
app.get('/home', async (req, res) => {
  if (!req.session.user || !req.session.user.email) {
    return res.redirect('/login');
  }
  const currentUser = await User.findOne({ email: req.session.user.email });
  const blogs = await Blog.find().sort({ createdAt: -1 }).populate('authorId');
  const excludedIds = [currentUser._id, ...currentUser.following];
  const randomUsers = await User.aggregate([
    { $match: { _id: { $nin: excludedIds } } },
    { $sample: { size: 3 } }  // 3 random users
  ]);
  res.render('home', { blogs, currentUserId: currentUser._id, randomUsers});
});
//profile route
app.get('/profil', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const user = await User.findById(req.session.user.id).populate('followers');
  const userBlogs = await Blog.find({ authorEmail: user.email }).sort({ createdAt: -1 });

  res.render('profil', { user: {
    ...user._doc,
    profilePicPath: user.profilePicPath || '/images/default-pfp-23.jpg'}, userBlogs });
});

//like/dislike route
app.post('/blog/:id/like', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Login required' });

  const blog = await Blog.findById(req.params.id);
  const userId = req.session.user.id;

  if (!blog) return res.status(404).json({ error: 'Blog not found' });

  const liked = blog.likes.includes(userId);
  const disliked = blog.dislikes.includes(userId);

  if (liked) {
    blog.likes.pull(userId); // unlike
  } else {
    blog.likes.push(userId);
    if (disliked) blog.dislikes.pull(userId); // remove dislike
  }

  await blog.save();
  res.json({ likes: blog.likes.length, dislikes: blog.dislikes.length });
});

app.post('/blog/:id/dislike', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Login required' });

  const blog = await Blog.findById(req.params.id);
  const userId = req.session.user.id;

  if (!blog) return res.status(404).json({ error: 'Blog not found' });

  const disliked = blog.dislikes.includes(userId);
  const liked = blog.likes.includes(userId);

  if (disliked) {
    blog.dislikes.pull(userId); // remove dislike
  } else {
    blog.dislikes.push(userId);
    if (liked) blog.likes.pull(userId); // remove like
  }

  await blog.save();
  res.json({ likes: blog.likes.length, dislikes: blog.dislikes.length });
});

//blog page route
app.get('/blog/:id', async (req, res) => {
  const blog = await Blog.findById(req.params.id).populate('authorId');
  if (!blog) return res.status(404).send('Blog not found');
  res.render('blog', { blog });
});

//search route
app.get('/search-users', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json([]);

  const users = await User.find({ 
    fullname: { $regex: q, $options: 'i' } 
  }).limit(5);

  res.json(users.map(u => ({ _id: u._id, fullname: u.fullname })));
});

//notification
app.get('/notification', async (req, res) => {
  const user = await User.findOne({ email: req.session.user.email });
  res.render('notification', { notifications: user.notifications });
});

//edit-profile
app.get('/edit-profile', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const user = await User.findOne({ email: req.session.user.email });
  res.render('edit-profile', { user });
});
app.post('/edit-profile', upload.single('profilePic'), async (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const user = await User.findOne({ email: req.session.user.email });

  user.fullname = req.body.fullname;
  user.bio = req.body.bio;
  
  if (req.file) {
    user.profilePic = '/images/' + req.file.filename;
  }

  await user.save();

  req.session.user = {
    name: user.fullname,
    email: user.email
  };

  res.redirect('/profil');
});
// follow route
app.post('/follow', async (req, res) => {
  try{
  const { targetUserId } = req.body;
   if (!req.session.user || !req.session.user.email) {
      return res.status(401).json({ error: 'Not logged in' });
    }
  const currentUser = await User.findOne({ email: req.session.user.email });
  const targetUser = await User.findById(targetUserId);

  if (!currentUser || !targetUser) {
    return res.status(404).json({error:'User not found'});
  }
   // 🚫 Prevent following yourself
    if (currentUser._id.equals(targetUser._id)) {
      return res.status(400).json({ error: "You can't follow yourself" });
    }

  let isFollowing = targetUser.followers.includes(currentUser._id);

    if (isFollowing) {
      // UNFOLLOW
      targetUser.followers.pull(currentUser._id);
      currentUser.following.pull(targetUser._id);
    } else {
      // FOLLOW
    targetUser.followers.push(currentUser._id);
    currentUser.following.push(targetUser._id);

    // Add notification
    targetUser.notifications.push({
      message: `@${currentUser.fullname} started following you.`,
      timestamp: new Date()
    });
  }
   await Promise.all([targetUser.save(), currentUser.save()]);
  
 res.json({ success: true, following: !isFollowing});
  } catch (err) {
    console.error("Error in /follow:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});
//user-profile
app.get('/user/:id', async (req, res) => {
  const userId = req.params.id;

  // 🔑 Check if logged in
  if (!req.session.user) {
    return res.redirect('/login');
  }

  // 🔑 Get the logged-in user
  const currentUser = await User.findOne({ email: req.session.user.email });

  // 🔑 Get the profile being viewed
  const user = await User.findById(userId).populate('followers').populate('following');
  const userBlogs = await Blog.find({ authorId: userId }).sort({ createdAt: -1 });

  if (!user) {
    return res.status(404).send('User not found');
  }

  // ✅ Render and pass currentUserId
  res.render('user-profile', { 
    user, 
    userBlogs, 
    currentUserId: currentUser._id 
  });
});

//update-profile
const fs = require('fs');

app.post('/update-profile', upload.single('profilePic'), async (req, res) => {
  // ✅ Check if session is valid
  if (!req.session || !req.session.user || !req.session.user.id) {
    return res.redirect('/login');
  }

    // ✅ Find the user by ID (more reliable than email)
    const user = await User.findById(req.session.user.id);
    if (!user)return res.redirect('/login');

    // ✅ Update fields
    user.fullname = req.body.fullname;
    user.bio = req.body.bio;

    if (req.file) {
      user.profilePic= '/images/' + req.file.filename;
    }

    await user.save();

    // ✅ Update session with new email & name
  req.session.user = {
  id: user._id,
  name: user.fullname,
  email: user.email,
  profilePic: user.profilePic || '/images/default-pfp-23.jpg'
};

    res.redirect('/profil');
});


// 🆕 Submit Blog POST
app.post('/submit-blog', upload.single('image'), async (req, res) => {
  if (!req.session.user) return res.redirect('/login');

   const currentUser = await User.findOne({ email: req.session.user.email });

  const { title, content, tags } = req.body;
  const imagePath = req.file ? '/images/' + req.file.filename : '';

  const blog = new Blog({
    title,
    content,
    tags: tags.split(',').map(tag => tag.trim()),
    imagePath,
    authorEmail: req.session.user.email,  // ✅ gets from session
    authorName: req.session.user.name,     // ✅ gets name from session
    authorId: currentUser._id

  });

  await blog.save();
  res.redirect('/home');
});
//create blog
app.get('/create-blog', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  res.render('create-blog', { blog: null, editing: false }); // Send empty blog and editing false
});

// edit blog 
app.get('/edit-blog/:id', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const blog = await Blog.findById(req.params.id);

  if (!blog || blog.authorEmail !== req.session.user.email) {
    return res.status(403).send('Not authorized or Blog not found');
  }

  res.render('create-blog', { blog, editing: true });  // Pass the blog data and editing flag
});

app.post('/update-blog/:id', upload.single('image'), async (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const blog = await Blog.findById(req.params.id);
  if (!blog || blog.authorEmail !== req.session.user.email) {
    return res.status(403).send('Not authorized');
  }

  blog.title = req.body.title;
  blog.content = req.body.content;
  blog.tags = req.body.tags.split(',').map(tag => tag.trim());
  
  if (req.file) {
    blog.imagePath = '/images/' + req.file.filename;
  }

  await blog.save();
  res.redirect('/profil');
});

// Dashboard Route
app.get('/dashboard', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const user = await User.findById(req.session.user.id);
  const blogs = await Blog.find({ authorEmail: user.email }).sort({ createdAt: -1 });

  res.render('dashboard', { user, blogs });
});
//home route
app.get('/',(req,res)=>{
  res.redirect('/login');
});

// Start server
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
