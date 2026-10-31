package com.qrstudio.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.qrstudio.common.JwtUtils;
import com.qrstudio.common.Result;
import com.qrstudio.common.UserContext;
import com.qrstudio.entity.User;
import com.qrstudio.mapper.UserMapper;
import io.jsonwebtoken.Claims;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
@RequiredArgsConstructor
public class AuthInterceptor implements HandlerInterceptor {

    private final JwtUtils jwtUtils;
    private final ObjectMapper objectMapper;
    private final UserMapper userMapper;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        // 进入时先清空：preHandle 返回 false 时 Spring 不会回调 afterCompletion，
        // 身份会残留在被复用的 Tomcat 线程上。不清的话，紧跟其后的匿名请求会
        // 继承上一个用户的身份（管理员之后的下一个匿名请求甚至能通过 admin 校验）。
        UserContext.clear();

        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        String path = request.getRequestURI();

        // 1. Extract token from Header "Authorization: Bearer ..." or Cookie "token"
        String token = null;
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7).trim();
        }

        if (token == null && request.getCookies() != null) {
            for (Cookie cookie : request.getCookies()) {
                if ("token".equals(cookie.getName())) {
                    token = cookie.getValue();
                    break;
                }
            }
        }

        // 2. Parse token if present
        if (token != null && jwtUtils.validateToken(token)) {
            Claims claims = jwtUtils.parseToken(token);
            String userId = claims.get("userId", String.class);

            // 2.1 只信 token 是不够的：账号被禁用 / 角色被调整后，旧 token 仍在有效期内。
            //     这里回查一次数据库，保证「禁用立即生效」「角色变更立即生效」。
            User user = userId != null ? userMapper.selectById(userId) : null;
            if (user != null && !"disabled".equals(user.getStatus())) {
                UserContext.set(UserContext.CurrentUser.builder()
                        .userId(user.getId())
                        .email(user.getEmail())
                        .role(user.getRole())
                        .build());
            }
        }

        // 3. 上传接口必须登录：否则任何人都能把匿名流量变成磁盘上的文件
        if (path.startsWith("/api/upload")) {
            if (UserContext.get() == null) {
                writeError(response, 401, "上传前请先登录");
                return false;
            }
        }

        // 4. Admin path requires admin role
        if (path.startsWith("/api/admin")) {
            UserContext.CurrentUser current = UserContext.get();
            if (current == null) {
                writeError(response, 401, "请先登录管理账号");
                return false;
            }
            if (!"admin".equals(current.getRole())) {
                writeError(response, 403, "权限不足，仅管理员可访问");
                return false;
            }
        }

        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        UserContext.clear();
    }

    private void writeError(HttpServletResponse response, int status, String message) throws Exception {
        response.setStatus(status);
        response.setContentType("application/json;charset=UTF-8");
        Result<?> res = Result.error(status, message);
        response.getWriter().write(objectMapper.writeValueAsString(res));
    }
}
