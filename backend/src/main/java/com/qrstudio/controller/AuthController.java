package com.qrstudio.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.qrstudio.common.JwtUtils;
import com.qrstudio.common.Result;
import com.qrstudio.common.UserContext;
import com.qrstudio.entity.User;
import com.qrstudio.mapper.UserMapper;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletResponse;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtils jwtUtils;

    @Data
    public static class AuthRequest {
        private String email;
        private String password;
    }

    @PostMapping("/register")
    public Result<?> register(@RequestBody AuthRequest req, HttpServletResponse response) {
        if (req.getEmail() == null || req.getEmail().trim().isEmpty() ||
            req.getPassword() == null || req.getPassword().length() < 6) {
            return Result.error("请输入有效的邮箱与至少6位密码");
        }

        String email = req.getEmail().trim().toLowerCase();
        User exist = userMapper.selectOne(new LambdaQueryWrapper<User>().eq(User::getEmail, email));
        if (exist != null) {
            return Result.error(400, "该邮箱已被注册，请直接登录");
        }

        User newUser = User.builder()
                .email(email)
                .password(passwordEncoder.encode(req.getPassword()))
                .role("user")
                .status("active")
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
        userMapper.insert(newUser);

        String token = jwtUtils.generateToken(newUser.getId(), newUser.getEmail(), newUser.getRole());
        setAuthCookie(response, token);

        Map<String, Object> data = new HashMap<>();
        data.put("token", token);
        data.put("user", Map.of(
                "id", newUser.getId(),
                "email", newUser.getEmail(),
                "role", newUser.getRole(),
                "status", newUser.getStatus()
        ));

        return Result.ok("注册成功", data);
    }

    @PostMapping("/login")
    public Result<?> login(@RequestBody AuthRequest req, HttpServletResponse response) {
        if (req.getEmail() == null || req.getPassword() == null) {
            return Result.error("请输入邮箱和密码");
        }

        String email = req.getEmail().trim().toLowerCase();
        User user = userMapper.selectOne(new LambdaQueryWrapper<User>().eq(User::getEmail, email));
        if (user == null || !passwordEncoder.matches(req.getPassword(), user.getPassword())) {
            return Result.error(401, "邮箱或密码错误");
        }

        if ("disabled".equals(user.getStatus())) {
            return Result.error(403, "该账号已被禁用，请联系管理员");
        }

        String token = jwtUtils.generateToken(user.getId(), user.getEmail(), user.getRole());
        setAuthCookie(response, token);

        Map<String, Object> data = new HashMap<>();
        data.put("token", token);
        data.put("user", Map.of(
                "id", user.getId(),
                "email", user.getEmail(),
                "role", user.getRole(),
                "status", user.getStatus()
        ));

        return Result.ok("登录成功", data);
    }

    @GetMapping("/me")
    public Result<?> getCurrentUser() {
        UserContext.CurrentUser current = UserContext.get();
        if (current == null) {
            return Result.ok(null);
        }

        User user = userMapper.selectById(current.getUserId());
        if (user == null || "disabled".equals(user.getStatus())) {
            return Result.error(401, "登录已失效");
        }

        Map<String, Object> userInfo = new HashMap<>();
        userInfo.put("id", user.getId());
        userInfo.put("email", user.getEmail());
        userInfo.put("role", user.getRole());
        userInfo.put("status", user.getStatus());
        userInfo.put("createdAt", user.getCreatedAt());

        return Result.ok(userInfo);
    }

    @PostMapping("/logout")
    public Result<?> logout(HttpServletResponse response) {
        Cookie cookie = new Cookie("token", "");
        cookie.setPath("/");
        cookie.setMaxAge(0);
        response.addCookie(cookie);
        return Result.ok("已退出登录");
    }

    private void setAuthCookie(HttpServletResponse response, String token) {
        Cookie cookie = new Cookie("token", token);
        cookie.setPath("/");
        cookie.setHttpOnly(true);
        cookie.setMaxAge(7 * 24 * 3600);
        response.addCookie(cookie);
    }
}
